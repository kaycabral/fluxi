import { fluxiDb, personalScope, seedUser, truncateFluxiTables } from '@/db'
import { accounts, banks, entries, spaces } from '@/db/schema'
import {
  bankEntryLinks,
  bankFeedAccounts,
  bankFeedItems,
  bankTransactions,
} from '@/db/schema-bank-feed'
import { listUnlinkedConnectedInstitutions } from '@/features/ledger/adapters/ledger.repo'
import type { Scope } from '@/features/spaces/core/space'
import { and, eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { assignFeedItem, createSpace, listFeedItems, listSpaces, updateSpace } from './space.repo'

const ANA = '11111111-1111-4111-8111-111111111111'
const BIA = '22222222-2222-4222-8222-222222222222'
const TODAY = '2026-11-25'
const db = () => fluxiDb.db()

let ana: Scope
let bia: Scope
let work: Scope

async function feedAccount(scope: Scope, itemId: string, externalId: string, txIds: string[]) {
  const [row] = await db()
    .insert(bankFeedAccounts)
    .values({
      ...scope,
      source: 'pluggy',
      externalId,
      itemId,
      institution: 'Banco X',
      name: `Conta ${externalId}`,
      type: 'BANK',
      subtype: 'CHECKING_ACCOUNT',
      balanceCents: 100,
      syncedAt: new Date('2026-11-01T00:00:00Z'),
    })
    .returning()
  if (row === undefined) throw new Error('no feed account')
  if (txIds.length > 0) {
    await db()
      .insert(bankTransactions)
      .values(
        txIds.map((externalId) => ({
          ...scope,
          feedAccountId: row.id,
          externalId,
          date: '2026-10-01',
          amountCents: -500,
          description: externalId,
          status: 'POSTED',
          syncedAt: new Date('2026-11-01T00:00:00Z'),
        })),
      )
  }
  return row
}

const feedRows = (userId: string) =>
  db().select().from(bankFeedAccounts).where(eq(bankFeedAccounts.userId, userId))
const txRows = (userId: string) =>
  db().select().from(bankTransactions).where(eq(bankTransactions.userId, userId))

describe('assignFeedItem (Postgres)', () => {
  beforeEach(async () => {
    await truncateFluxiTables(db())
    await seedUser(db(), { id: ANA, email: 'ana@example.test' })
    await seedUser(db(), { id: BIA, email: 'bia@example.test' })
    ana = await personalScope(db(), ANA)
    bia = await personalScope(db(), BIA)
    const [business] = await db()
      .insert(spaces)
      .values({ userId: ANA, name: 'Loja', kind: 'business' })
      .returning()
    work = { userId: ANA, spaceId: business!.id }
    await db()
      .insert(bankFeedItems)
      .values([
        { userId: ANA, itemId: 'item-1', spaceId: ana.spaceId },
        { userId: ANA, itemId: 'item-2', spaceId: ana.spaceId },
        { userId: BIA, itemId: 'item-1', spaceId: bia.spaceId },
      ])
  })

  afterAll(async () => {
    await fluxiDb.close()
  })

  it('moves the connection data to the new space and clears the mapping', async () => {
    const moving = await feedAccount(ana, 'item-1', 'acc-1', ['t1', 't2'])
    await feedAccount(ana, 'item-2', 'acc-2', ['t3'])
    await feedAccount(bia, 'item-1', 'acc-1', ['t1'])
    const [bank] = await db()
      .insert(banks)
      .values({ ...ana, name: 'B' })
      .returning()
    const [mapped] = await db()
      .insert(accounts)
      .values({ ...ana, bankId: bank!.id, name: 'C', type: 'checking' })
      .returning()
    await db()
      .update(bankFeedAccounts)
      .set({ accountId: mapped!.id })
      .where(eq(bankFeedAccounts.id, moving.id))
    await db()
      .insert(entries)
      .values({
        ...ana,
        kind: 'expense',
        description: 'Aluguel',
        amountCents: 100,
        accountId: mapped!.id,
        startMonth: '2026-11-01',
        day: 5,
        recurrence: 'none',
      })
    // What the sync materialized from t1: an entry linked to the transaction.
    const [t1] = (await txRows(ANA)).filter(
      (t) => t.externalId === 't1' && t.spaceId === ana.spaceId,
    )
    const [fromBank] = await db()
      .insert(entries)
      .values({
        ...ana,
        kind: 'expense',
        description: 'Banco t1',
        amountCents: -100,
        accountId: mapped!.id,
        startMonth: '2026-11-01',
        day: 1,
        recurrence: 'none',
      })
      .returning()
    await db()
      .insert(bankEntryLinks)
      .values({ ...ana, bankTransactionId: t1!.id, entryId: fromBank!.id })
    expect((await listFeedItems(ANA)).find((i) => i.itemId === 'item-1')).toMatchObject({
      transactionCount: 2,
      accounts: ['Conta acc-1'],
    })

    expect(await assignFeedItem(ANA, 'item-1', work.spaceId, TODAY)).toBe(true)

    const feeds = await feedRows(ANA)
    const moved = feeds.find((f) => f.externalId === 'acc-1')
    // The old mapping is gone; the new space auto-links it (it has movement).
    expect(moved).toMatchObject({ spaceId: work.spaceId, mappingSource: 'auto', itemId: 'item-1' })
    expect(moved?.accountId).not.toBe(mapped!.id)
    const [relinked] = await db().select().from(accounts).where(eq(accounts.id, moved!.accountId!))
    expect(relinked?.spaceId).toBe(work.spaceId)
    expect(feeds.find((f) => f.externalId === 'acc-2')?.spaceId).toBe(ana.spaceId)
    const txs = await txRows(ANA)
    expect(
      txs
        .filter((t) => t.spaceId === work.spaceId)
        .map((t) => t.externalId)
        .sort(),
    ).toEqual(['t1', 't2'])
    expect(txs.every((t) => t.spaceId !== work.spaceId || t.feedAccountId === moved!.id)).toBe(true)
    expect(txs.filter((t) => t.spaceId === ana.spaceId).map((t) => t.externalId)).toEqual(['t3'])
    const [item] = await db()
      .select()
      .from(bankFeedItems)
      .where(and(eq(bankFeedItems.userId, ANA), eq(bankFeedItems.itemId, 'item-1')))
    expect(item?.spaceId).toBe(work.spaceId)
    // Planned entries and the other user stay untouched; what was materialized
    // from the moved transactions leaves with its links.
    expect(
      (await db().select().from(entries).where(eq(entries.userId, ANA)))
        .filter((e) => e.spaceId === ana.spaceId)
        .map((e) => [e.description, e.spaceId]),
    ).toEqual([['Aluguel', ana.spaceId]])
    expect(
      (await db().select().from(entries).where(eq(entries.userId, ANA)))
        .filter((e) => e.spaceId === work.spaceId)
        .map((e) => e.description)
        .sort(),
    ).toEqual(['t1', 't2'])
    expect(
      (await db().select().from(bankEntryLinks)).every((l) => l.spaceId === work.spaceId),
    ).toBe(true)
    expect((await feedRows(BIA)).map((f) => f.spaceId)).toEqual([bia.spaceId])
    expect(await txRows(BIA)).toHaveLength(1)
  })

  it('merges with the same external account already in the destination', async () => {
    await feedAccount(ana, 'item-1', 'acc-1', ['t1', 't2'])
    const twin = await feedAccount(work, 'item-1', 'acc-1', ['t2', 't3'])

    expect(await assignFeedItem(ANA, 'item-1', work.spaceId, TODAY)).toBe(true)

    const feeds = await feedRows(ANA)
    expect(feeds.map((f) => [f.id, f.spaceId])).toEqual([[twin.id, work.spaceId]])
    const txs = await txRows(ANA)
    expect(txs.map((t) => t.externalId).sort()).toEqual(['t1', 't2', 't3'])
    expect(txs.every((t) => t.feedAccountId === twin.id && t.spaceId === work.spaceId)).toBe(true)

    // And back again: everything returns to the personal space, nothing duplicated.
    expect(await assignFeedItem(ANA, 'item-1', ana.spaceId, TODAY)).toBe(true)
    expect((await feedRows(ANA)).map((f) => f.spaceId)).toEqual([ana.spaceId])
    expect((await txRows(ANA)).map((t) => t.spaceId)).toEqual([
      ana.spaceId,
      ana.spaceId,
      ana.spaceId,
    ])
  })

  it('refuses a foreign or archived space and keeps data on unassign', async () => {
    await feedAccount(ana, 'item-1', 'acc-1', ['t1'])
    expect(await assignFeedItem(ANA, 'item-1', bia.spaceId, TODAY)).toBe(false)
    expect(await assignFeedItem(BIA, 'item-2', bia.spaceId, TODAY)).toBe(false)
    await db().update(spaces).set({ archivedAt: new Date() }).where(eq(spaces.id, work.spaceId))
    expect(await assignFeedItem(ANA, 'item-1', work.spaceId, TODAY)).toBe(false)
    expect((await feedRows(ANA)).map((f) => f.spaceId)).toEqual([ana.spaceId])

    expect(await assignFeedItem(ANA, 'item-1', null, TODAY)).toBe(true)
    expect((await feedRows(ANA)).map((f) => f.spaceId)).toEqual([ana.spaceId])
    expect(await txRows(ANA)).toHaveLength(1)
  })
})

describe('space name and icon (Postgres)', () => {
  beforeEach(async () => {
    await truncateFluxiTables(db())
    await seedUser(db(), { id: ANA, email: 'ana@example.test' })
    await seedUser(db(), { id: BIA, email: 'bia@example.test' })
    ana = await personalScope(db(), ANA)
    bia = await personalScope(db(), BIA)
  })

  it('gives the personal space a person and a created one the chosen icon (briefcase by default)', async () => {
    await createSpace(ANA, { id: '33333333-3333-4333-8333-333333333333', name: 'Freela' })
    await createSpace(ANA, {
      id: '44444444-4444-4444-8444-444444444444',
      name: 'Casa',
      icon: 'house',
    })
    const rows = await listSpaces(ANA)
    expect(rows.map((s) => [s.name, s.kind, s.icon])).toEqual([
      ['Pessoal', 'personal', 'user'],
      ['Freela', 'business', 'briefcase'],
      ['Casa', 'business', 'house'],
    ])
  })

  it('renames the personal space and changes its icon, only for its owner', async () => {
    await expect(updateSpace(BIA, { id: ana.spaceId, name: 'Hack', icon: 'plane' })).resolves.toBe(
      false,
    )
    await expect(updateSpace(ANA, { id: ana.spaceId, name: 'Casa', icon: 'house' })).resolves.toBe(
      true,
    )
    const [personal] = await listSpaces(ANA)
    expect(personal).toMatchObject({ name: 'Casa', icon: 'house', kind: 'personal' })
    const [biaSpace] = await listSpaces(BIA)
    expect(biaSpace).toMatchObject({ name: 'Pessoal', icon: 'user' })
  })

  it('refuses an unknown icon key', async () => {
    await expect(
      db().update(spaces).set({ icon: 'rocket' }).where(eq(spaces.id, ana.spaceId)),
    ).rejects.toThrow()
  })
})

describe('connection status and connected banks (Postgres)', () => {
  beforeEach(async () => {
    await truncateFluxiTables(db())
    await seedUser(db(), { id: ANA, email: 'ana@example.test' })
    await seedUser(db(), { id: BIA, email: 'bia@example.test' })
    ana = await personalScope(db(), ANA)
    bia = await personalScope(db(), BIA)
    await db()
      .insert(bankFeedItems)
      .values([
        { userId: ANA, itemId: 'item-1', spaceId: ana.spaceId },
        { userId: ANA, itemId: 'item-2', spaceId: ana.spaceId, label: 'Inter' },
        { userId: BIA, itemId: 'item-1', spaceId: bia.spaceId },
      ])
  })

  it('reports the latest movement of each feed account, only from its own transactions', async () => {
    const quiet = await feedAccount(ana, 'item-1', 'acc-quiet', [])
    const busy = await feedAccount(ana, 'item-1', 'acc-busy', ['t1'])
    await db()
      .update(bankFeedAccounts)
      .set({ cardStatus: 'blocked' })
      .where(eq(bankFeedAccounts.id, quiet.id))
    // Bia's newer transaction never leaks into Ana's account.
    await feedAccount(bia, 'item-1', 'acc-busy', ['t9'])
    await db()
      .update(bankTransactions)
      .set({ date: '2026-11-20' })
      .where(eq(bankTransactions.userId, BIA))
    const [item] = await listFeedItems(ANA)
    const byId = new Map(item!.feedAccounts.map((f) => [f.id, f]))
    expect(byId.get(busy.id)).toMatchObject({ lastMovement: '2026-10-01', cardStatus: null })
    expect(byId.get(quiet.id)).toMatchObject({ lastMovement: null, cardStatus: 'blocked' })
  })

  it('lists the connected institutions of the space that have no linked account', async () => {
    await feedAccount(ana, 'item-1', 'acc-1', [])
    await expect(listUnlinkedConnectedInstitutions(ana)).resolves.toEqual(['Banco X', 'Inter'])
    const [bank] = await db()
      .insert(banks)
      .values({ ...ana, name: 'B' })
      .returning()
    const [account] = await db()
      .insert(accounts)
      .values({ ...ana, bankId: bank!.id, name: 'C', type: 'checking' })
      .returning()
    await db()
      .update(bankFeedAccounts)
      .set({ accountId: account!.id })
      .where(eq(bankFeedAccounts.userId, ANA))
    await expect(listUnlinkedConnectedInstitutions(ana)).resolves.toEqual(['Inter'])
    await expect(listUnlinkedConnectedInstitutions(bia)).resolves.toEqual([])
  })
})
