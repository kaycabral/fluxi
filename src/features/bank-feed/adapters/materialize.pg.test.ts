import { fluxiDb, personalScope, seedUser, truncateFluxiTables } from '@/db'
import { accounts, banks, entries, occurrencePayments } from '@/db/schema'
import { bankEntryLinks, bankFeedAccounts, bankTransactions } from '@/db/schema-bank-feed'
import type { FeedAccountRow, FeedTransactionRow } from '@/features/bank-feed/core/pluggy'
import { deleteEntry } from '@/features/ledger/adapters/ledger.write'
import { projectLedger } from '@/features/ledger/adapters/projection'
import { undoLastAction } from '@/features/ledger/adapters/undo.write'
import type { Scope } from '@/features/spaces/core/space'
import { requireEnv } from '@cbrl/env'
import { and, eq } from 'drizzle-orm'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { syncFeedAccount } from './feed.write'
import { materializeSpace } from './sync'

const ANA = '11111111-1111-4111-8111-111111111111'
const BIA = '22222222-2222-4222-8222-222222222222'
const TODAY = '2026-11-25'

const db = () => fluxiDb.db()
/** Exactly like the Edge Function: postgres.js as the `fluxi_sync` role. */
const asSync = postgres(requireEnv('POSTGRES_URL'), { prepare: false, max: 1 })

let ana: Scope
let checkingId: string
let cardId: string

const checkingFeed: FeedAccountRow = {
  externalId: 'acc-checking',
  itemId: 'item-1',
  institution: 'BTG',
  name: 'Conta',
  type: 'BANK',
  subtype: 'CHECKING_ACCOUNT',
  balanceCents: 100000,
}
const cardFeed: FeedAccountRow = {
  ...checkingFeed,
  externalId: 'acc-card',
  name: 'Cartão',
  type: 'CREDIT',
  subtype: 'CREDIT_CARD',
  // The open bill, owed.
  balanceCents: 30000,
}

const tx = (externalId: string, over: Partial<FeedTransactionRow> = {}): FeedTransactionRow => ({
  externalId,
  date: '2026-11-10',
  amountCents: -5000,
  description: `Banco ${externalId}`,
  status: 'POSTED',
  category: null,
  operationType: null,
  installmentNumber: null,
  totalInstallments: null,
  billMonth: null,
  ...over,
})

const feed = (scope: Scope, acc: FeedAccountRow, rows: FeedTransactionRow[]) =>
  syncFeedAccount(asSync, scope, {
    source: 'pluggy',
    account: acc,
    transactions: rows,
    coveredFrom: '2026-01-01',
  })

const materialize = (scope: Scope = ana) => materializeSpace(asSync, scope, TODAY)

async function map(scope: Scope, externalId: string, accountId: string) {
  await db()
    .update(bankFeedAccounts)
    .set({ accountId })
    .where(
      and(eq(bankFeedAccounts.spaceId, scope.spaceId), eq(bankFeedAccounts.externalId, externalId)),
    )
}

async function seedAccounts(scope: Scope) {
  const [bank] = await db()
    .insert(banks)
    .values({ ...scope, name: 'BTG' })
    .returning()
  if (bank === undefined) throw new Error('bank not created')
  const rows = await db()
    .insert(accounts)
    .values([
      { ...scope, bankId: bank.id, name: 'Conta', type: 'checking', openingBalanceCents: 0 },
      { ...scope, bankId: bank.id, name: 'Cartão', type: 'credit', openingBalanceCents: 0 },
    ])
    .returning()
  const [checking, card] = rows
  if (checking === undefined || card === undefined) throw new Error('accounts not created')
  return { checking: checking.id, card: card.id }
}

const entriesOf = (scope: Scope) =>
  db().select().from(entries).where(eq(entries.spaceId, scope.spaceId)).orderBy(entries.description)

const linksOf = (scope: Scope) =>
  db().select().from(bankEntryLinks).where(eq(bankEntryLinks.spaceId, scope.spaceId))

beforeAll(async () => {
  await asSync`set role fluxi_sync`
})

beforeEach(async () => {
  await truncateFluxiTables(db())
  await seedUser(db(), { id: ANA, email: 'ana@example.test' })
  await seedUser(db(), { id: BIA, email: 'bia@example.test' })
  ana = await personalScope(db(), ANA)
  const ids = await seedAccounts(ana)
  checkingId = ids.checking
  cardId = ids.card
})

afterAll(async () => {
  await truncateFluxiTables(db())
  await asSync.end()
})

describe('materialize_bank_feed (Postgres)', () => {
  it('only materializes mapped accounts, as one-off paid entries, idempotently', async () => {
    await feed(ana, checkingFeed, [
      tx('t1', { amountCents: -5000, date: '2026-11-03' }),
      tx('t2', { amountCents: 250000, date: '2026-11-05', category: 'Salary' }),
    ])
    expect(await materialize()).toMatchObject({ created: 0 })
    expect(await entriesOf(ana)).toHaveLength(0)

    await map(ana, 'acc-checking', checkingId)
    expect(await materialize()).toEqual({
      removed: 0,
      transfers: 0,
      created: 2,
      updated: 0,
      anchored: 1,
    })
    const rows = await entriesOf(ana)
    expect(
      rows.map((e) => [e.description, e.kind, e.amountCents, e.startMonth, e.day, e.recurrence]),
    ).toEqual([
      ['Banco t1', 'expense', -5000, '2026-11-01', 3, 'none'],
      ['Banco t2', 'income', 250000, '2026-11-01', 5, 'none'],
    ])
    expect(rows.every((e) => e.categoryId === null && e.pot === null)).toBe(true)
    const paid = await db().select().from(occurrencePayments)
    expect(paid.map((p) => p.paidOn).sort()).toEqual(['2026-11-03', '2026-11-05'])
    // The Pluggy category stays on the bank transaction for later categorization.
    const raw = await db().select().from(bankTransactions)
    expect(raw.find((r) => r.externalId === 't2')?.category).toBe('Salary')

    expect(await materialize()).toEqual({
      removed: 0,
      transfers: 0,
      created: 0,
      updated: 0,
      anchored: 0,
    })
    expect(await entriesOf(ana)).toHaveLength(2)
    expect(await linksOf(ana)).toHaveLength(2)
  })

  it('re-syncs the bank fields and never the user fields', async () => {
    await map(ana, 'acc-checking', checkingId)
    await feed(ana, checkingFeed, [tx('t1', { date: '2026-11-03' })])
    await map(ana, 'acc-checking', checkingId)
    await materialize()
    const [entry] = await entriesOf(ana)
    await db()
      .update(entries)
      .set({ description: 'Farmácia', pot: 'essential' })
      .where(eq(entries.id, entry!.id))

    await feed(ana, checkingFeed, [tx('t1', { date: '2026-12-02', amountCents: -6100 })])
    expect(await materialize()).toMatchObject({ created: 0, updated: 1 })
    const [after] = await entriesOf(ana)
    expect(after).toMatchObject({
      id: entry!.id,
      description: 'Farmácia',
      pot: 'essential',
      amountCents: -6100,
      startMonth: '2026-12-01',
      day: 2,
    })
    const paid = await db().select().from(occurrencePayments)
    expect(paid.map((p) => [p.month, p.paidOn])).toEqual([['2026-12-01', '2026-12-02']])
  })

  it('keeps a deleted entry as a tombstone, and undo brings the link back', async () => {
    await feed(ana, checkingFeed, [tx('t1')])
    await map(ana, 'acc-checking', checkingId)
    await materialize()
    const [entry] = await entriesOf(ana)

    const deleted = await deleteEntry(ana, entry!.id, null)
    expect(deleted.ok).toBe(true)
    expect((await linksOf(ana)).map((l) => [l.entryId, l.discarded])).toEqual([[null, true]])
    expect(await materialize()).toMatchObject({ created: 0 })
    expect(await entriesOf(ana)).toHaveLength(0)

    if (!deleted.ok || deleted.undo === undefined) throw new Error('no undo token')
    expect(await undoLastAction(ana, deleted.undo)).toEqual({ ok: true })
    expect((await linksOf(ana)).map((l) => [l.entryId, l.discarded])).toEqual([[entry!.id, false]])
  })

  it('deletes the entry of a transaction the bank removed, and drops a tombstone', async () => {
    await feed(ana, checkingFeed, [tx('t1'), tx('t2')])
    await map(ana, 'acc-checking', checkingId)
    await materialize()
    const t2 = (await entriesOf(ana)).find((e) => e.description === 'Banco t2')
    await deleteEntry(ana, t2!.id, null)

    await feed(ana, checkingFeed, [])
    expect(await materialize()).toMatchObject({ removed: 1 })
    expect(await entriesOf(ana)).toHaveLength(0)
    expect(await linksOf(ana)).toHaveLength(0)
  })

  it('pairs a card bill payment into one transfer, even when one side arrives later', async () => {
    await feed(ana, checkingFeed, [
      tx('pay', { amountCents: -30000, date: '2026-11-10', category: 'Credit card payment' }),
      // Same amount, no signal, same distance: loses to the signaled pair.
      tx('pix', { amountCents: -30000, date: '2026-11-12' }),
    ])
    await map(ana, 'acc-checking', checkingId)
    await materialize()
    expect((await entriesOf(ana)).map((e) => e.kind)).toEqual(['expense', 'expense'])
    const payId = (await entriesOf(ana)).find((e) => e.description === 'Banco pay')!.id
    await db().update(entries).set({ description: 'Fatura' }).where(eq(entries.id, payId))

    await feed(ana, cardFeed, [
      tx('bill', { amountCents: 30000, date: '2026-11-11', operationType: 'PAGAMENTO_FATURA' }),
      tx('buy', { amountCents: -2000, date: '2026-11-11' }),
    ])
    await map(ana, 'acc-card', cardId)
    expect(await materialize()).toMatchObject({ transfers: 1, created: 1 })
    const rows = await entriesOf(ana)
    const transfer = rows.find((e) => e.kind === 'transfer')
    expect(transfer).toMatchObject({
      id: payId,
      description: 'Fatura',
      amountCents: -30000,
      accountId: checkingId,
      toAccountId: cardId,
    })
    expect(rows.filter((e) => e.kind === 'transfer')).toHaveLength(1)
    expect((await linksOf(ana)).filter((l) => l.entryId === payId)).toHaveLength(2)

    // Stable across syncs.
    expect(await materialize()).toMatchObject({ transfers: 0, created: 0, updated: 0 })
  })

  it('anchors the balances to the bank, credit cards as debt', async () => {
    await feed(ana, checkingFeed, [
      tx('in', { amountCents: 200000, date: '2026-11-05' }),
      tx('out', { amountCents: -50000, date: '2026-11-20' }),
      // Future-dated: projected after today, not part of today's balance.
      tx('later', { amountCents: -1000, date: '2026-11-28' }),
    ])
    await feed(ana, cardFeed, [tx('buy', { amountCents: -12000, date: '2026-11-15' })])
    await map(ana, 'acc-checking', checkingId)
    await map(ana, 'acc-card', cardId)
    await materialize()

    const [checking] = await db().select().from(accounts).where(eq(accounts.id, checkingId))
    const [card] = await db().select().from(accounts).where(eq(accounts.id, cardId))
    expect(checking?.openingBalanceCents).toBe(100000 - 150000)
    expect(card?.openingBalanceCents).toBe(-30000 + 12000)

    const { months } = await projectLedger(ana, { from: '2026-11', to: '2026-11' })
    const balances = months[0]!.closingBalances
    // End of November = today's bank balance + what lands after today.
    expect(balances[checkingId]).toBe(100000 - 1000)
    expect(balances[cardId]).toBe(-30000)
  })

  it('keeps fluxi_sync away from the ledger and refuses another user’s space', async () => {
    await expect(asSync`select 1 from entries limit 1`).rejects.toThrow(/permission denied/)
    await expect(asSync`select 1 from accounts limit 1`).rejects.toThrow(/permission denied/)
    await expect(asSync`select 1 from bank_entry_links limit 1`).rejects.toThrow(
      /permission denied/,
    )
    await expect(
      asSync`select * from private.mapped_bank_transactions(${ANA}::uuid, ${ana.spaceId}::uuid)`,
    ).rejects.toThrow(/permission denied/)

    await feed(ana, checkingFeed, [tx('t1')])
    await map(ana, 'acc-checking', checkingId)
    await expect(materialize({ userId: BIA, spaceId: ana.spaceId })).rejects.toThrow(
      /unknown space/,
    )
    const bia = await personalScope(db(), BIA)
    expect(await materialize(bia)).toMatchObject({ created: 0, anchored: 0 })
    expect(await entriesOf(ana)).toHaveLength(0)

    const asApi = postgres(requireEnv('POSTGRES_URL'), { prepare: false, max: 1 })
    try {
      await asApi`set role authenticated`
      await expect(
        asApi`select private.materialize_bank_feed(${ANA}::uuid, ${ana.spaceId}::uuid, ${TODAY}::date)`,
      ).rejects.toThrow(/permission denied/)
    } finally {
      await asApi.end()
    }
  })
})
