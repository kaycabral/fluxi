import { fluxiDb, personalScope, seedUser, truncateFluxiTables } from '@/db'
import { accounts, banks, entries, spaces } from '@/db/schema'
import { bankEntryLinks, bankFeedAccounts, bankFeedItems } from '@/db/schema-bank-feed'
import { syncFeedAccount } from '@/features/bank-feed/adapters/feed.write'
import type { FeedTransactionRow } from '@/features/bank-feed/core/pluggy'
import { renameAccount, setAccountArchived } from '@/features/ledger/adapters/ledger.write'
import type { Scope } from '@/features/spaces/core/space'
import { requireEnv } from '@cbrl/env'
import { and, eq } from 'drizzle-orm'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { mapFeedAccount } from './feed-mapping'

const ANA = '11111111-1111-4111-8111-111111111111'
const BIA = '22222222-2222-4222-8222-222222222222'
const TODAY = '2026-11-25'
const db = () => fluxiDb.db()
const raw = postgres(requireEnv('POSTGRES_URL'), { prepare: false, max: 1 })

let ana: Scope
let cardFeedId: string
let checkingId: string

const tx = (externalId: string, amountCents: number, date: string): FeedTransactionRow => ({
  externalId,
  date,
  amountCents,
  description: `Banco ${externalId}`,
  status: 'POSTED',
  category: null,
  operationType: null,
  installmentNumber: null,
  totalInstallments: null,
  billMonth: null,
  merchantName: null,
  merchantCategory: null,
})

const entriesOf = (scope: Scope) =>
  db().select().from(entries).where(eq(entries.spaceId, scope.spaceId))

beforeEach(async () => {
  await truncateFluxiTables(db())
  await seedUser(db(), { id: ANA, email: 'ana@example.test' })
  await seedUser(db(), { id: BIA, email: 'bia@example.test' })
  ana = await personalScope(db(), ANA)
  await db()
    .insert(bankFeedItems)
    .values({ userId: ANA, itemId: 'item-1', spaceId: ana.spaceId, label: 'BTG' })
  await syncFeedAccount(raw, ana, {
    source: 'pluggy',
    account: {
      externalId: 'card',
      itemId: 'item-1',
      institution: 'MeuPluggy',
      name: 'BTG Cartão',
      type: 'CREDIT',
      subtype: 'CREDIT_CARD',
      balanceCents: 30000,
      numberHint: null,
      cardStatus: null,
    },
    transactions: [tx('a', -10000, '2026-11-10'), tx('b', -2000, '2026-11-12')],
    coveredFrom: '2026-01-01',
  })
  const [feed] = await db().select().from(bankFeedAccounts).where(eq(bankFeedAccounts.userId, ANA))
  cardFeedId = feed!.id
  const [bank] = await db()
    .insert(banks)
    .values({ ...ana, name: 'Itaú' })
    .returning()
  const [checking] = await db()
    .insert(accounts)
    .values({ ...ana, bankId: bank!.id, name: 'Conta', type: 'checking', openingBalanceCents: 0 })
    .returning()
  checkingId = checking!.id
})

afterAll(async () => {
  await truncateFluxiTables(db())
  await raw.end()
})

describe('mapFeedAccount (Postgres)', () => {
  it('creates the account, materializes right away, and remaps/unmaps cleanly', async () => {
    expect(
      await mapFeedAccount(ANA, { feedAccountId: cardFeedId, target: { kind: 'create' } }, TODAY),
    ).toEqual({ ok: true })
    const [feed] = await db()
      .select()
      .from(bankFeedAccounts)
      .where(eq(bankFeedAccounts.id, cardFeedId))
    const [created] = await db().select().from(accounts).where(eq(accounts.id, feed!.accountId!))
    // Named after the institution derived from the feed ("BTG Cartão"), never "MeuPluggy".
    expect(created).toMatchObject({ name: 'Cartão', type: 'credit', spaceId: ana.spaceId })
    expect(feed?.mappingSource).toBe('manual')
    const [bank] = await db().select().from(banks).where(eq(banks.id, created!.bankId))
    expect(bank?.name).toBe('BTG Pactual')
    expect((await entriesOf(ana)).map((e) => e.amountCents).sort()).toEqual([-10000, -2000])
    // Anchored: −300,00 owed today = opening − 120,00.
    expect(created?.openingBalanceCents).toBe(-30000 + 12000)

    // Remap onto another credit account: the old entries go, new ones come.
    const [other] = await db()
      .insert(accounts)
      .values({ ...ana, bankId: created!.bankId, name: 'Cartão 2', type: 'credit' })
      .returning()
    const before = (await entriesOf(ana)).map((e) => e.id)
    expect(
      await mapFeedAccount(
        ANA,
        { feedAccountId: cardFeedId, target: { kind: 'account', accountId: other!.id } },
        TODAY,
      ),
    ).toEqual({ ok: true })
    const after = await entriesOf(ana)
    expect(after.every((e) => e.accountId === other!.id && !before.includes(e.id))).toBe(true)
    expect(after).toHaveLength(2)
    const [old] = await db().select().from(accounts).where(eq(accounts.id, created!.id))
    expect(old?.openingBalanceCents).toBe(-18000)

    // Unmap: the bank entries go, nothing else.
    expect(
      await mapFeedAccount(ANA, { feedAccountId: cardFeedId, target: { kind: 'none' } }, TODAY),
    ).toEqual({ ok: true })
    expect(await entriesOf(ana)).toHaveLength(0)
    expect(await db().select().from(bankEntryLinks)).toHaveLength(0)
  })

  it('refuses incompatible, foreign and archived targets, and other users', async () => {
    const target = (accountId: string) => ({
      feedAccountId: cardFeedId,
      target: { kind: 'account' as const, accountId },
    })
    expect(await mapFeedAccount(ANA, target(checkingId), TODAY)).toEqual({
      ok: false,
      reason: 'invalid_account',
    })
    const [work] = await db()
      .insert(spaces)
      .values({ userId: ANA, name: 'Empresa', kind: 'business' })
      .returning()
    const [workBank] = await db()
      .insert(banks)
      .values({ userId: ANA, spaceId: work!.id, name: 'B' })
      .returning()
    const [workCard] = await db()
      .insert(accounts)
      .values({ userId: ANA, spaceId: work!.id, bankId: workBank!.id, name: 'C', type: 'credit' })
      .returning()
    expect(await mapFeedAccount(ANA, target(workCard!.id), TODAY)).toMatchObject({ ok: false })
    expect(
      await mapFeedAccount(BIA, { feedAccountId: cardFeedId, target: { kind: 'create' } }, TODAY),
    ).toEqual({ ok: false, reason: 'not_found' })
    // An unassigned connection cannot be mapped.
    await db()
      .update(bankFeedItems)
      .set({ spaceId: null })
      .where(and(eq(bankFeedItems.userId, ANA), eq(bankFeedItems.itemId, 'item-1')))
    expect(
      await mapFeedAccount(ANA, { feedAccountId: cardFeedId, target: { kind: 'create' } }, TODAY),
    ).toEqual({ ok: false, reason: 'not_found' })
    expect(await entriesOf(ana)).toHaveLength(0)
  })

  it('refuses to archive a connected account until it is unmapped', async () => {
    await mapFeedAccount(ANA, { feedAccountId: cardFeedId, target: { kind: 'create' } }, TODAY)
    const [feed] = await db()
      .select()
      .from(bankFeedAccounts)
      .where(eq(bankFeedAccounts.id, cardFeedId))
    const id = feed!.accountId!
    expect(await setAccountArchived(ana, { id, archived: true })).toEqual({
      ok: false,
      reason: 'account_connected',
    })
    expect(await renameAccount(ana, { id, name: 'Cartão Visa' })).toEqual({ ok: true })
    await mapFeedAccount(ANA, { feedAccountId: cardFeedId, target: { kind: 'none' } }, TODAY)
    expect(await setAccountArchived(ana, { id, archived: true })).toEqual({ ok: true })
    const [archived] = await db().select().from(accounts).where(eq(accounts.id, id))
    expect(archived).toMatchObject({ name: 'Cartão Visa' })
    expect(archived?.archivedAt).not.toBeNull()
    expect(await setAccountArchived(ana, { id, archived: false })).toEqual({ ok: true })
    const bia = await personalScope(db(), BIA)
    expect(await setAccountArchived(bia, { id, archived: true })).toEqual({
      ok: false,
      reason: 'not_found',
    })
  })
})
