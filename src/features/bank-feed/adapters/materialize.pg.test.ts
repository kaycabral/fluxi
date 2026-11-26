import { fluxiDb, personalScope, seedUser, truncateFluxiTables } from '@/db'
import { accounts, banks, entries, occurrencePayments } from '@/db/schema'
import { bankEntryLinks, bankFeedAccounts, bankTransactions } from '@/db/schema-bank-feed'
import type { FeedAccountRow, FeedTransactionRow } from '@/features/bank-feed/core/pluggy'
import { loadLedger } from '@/features/ledger/adapters/ledger.repo'
import {
  changeOccurrenceDay,
  deleteEntry,
  updateEntry,
} from '@/features/ledger/adapters/ledger.write'
import { markOccurrencePaid, unmarkOccurrencePaid } from '@/features/ledger/adapters/payments.write'
import { projectLedger } from '@/features/ledger/adapters/projection'
import { undoLastAction } from '@/features/ledger/adapters/undo.write'
import type { EntryFields } from '@/features/ledger/core/schemas'
import type { Scope } from '@/features/spaces/core/space'
import { requireEnv } from '@cbrl/env'
import { and, eq, isNull } from 'drizzle-orm'
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
  numberHint: null,
  cardStatus: null,
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
  merchantName: null,
  merchantCategory: null,
  ...over,
})

/**
 * Sync one feed account. These tests drive the mapping by hand, so a feed
 * account nobody decided is marked as the user's "Não vincular" (`manual`):
 * the auto-link (`autolink.pg.test.ts`) stays out of the way.
 */
async function feed(scope: Scope, acc: FeedAccountRow, rows: FeedTransactionRow[]) {
  const done = await syncFeedAccount(asSync, scope, {
    source: 'pluggy',
    account: acc,
    transactions: rows,
    coveredFrom: '2026-01-01',
  })
  await db()
    .update(bankFeedAccounts)
    .set({ mappingSource: 'manual' })
    .where(and(eq(bankFeedAccounts.spaceId, scope.spaceId), isNull(bankFeedAccounts.mappingSource)))
  return done
}

const materialize = (scope: Scope = ana) => materializeSpace(asSync, scope, TODAY)

async function map(scope: Scope, externalId: string, accountId: string) {
  await db()
    .update(bankFeedAccounts)
    .set({ accountId, mappingSource: 'manual' })
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
      linked: 0,
      split: 0,
      categorized: 0,
      named: 0,
    })
    const rows = await entriesOf(ana)
    expect(
      rows.map((e) => [e.description, e.kind, e.amountCents, e.startMonth, e.day, e.recurrence]),
    ).toEqual([
      ['Banco t1', 'expense', -5000, '2026-11-01', 3, 'none'],
      ['Banco t2', 'income', 250000, '2026-11-01', 5, 'none'],
    ])
    expect(rows.every((e) => e.categoryId === null && e.budgetGroup === null)).toBe(true)
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
      linked: 0,
      split: 0,
      categorized: 0,
      named: 0,
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
      .set({ description: 'Farmácia', budgetGroup: 'essential' })
      .where(eq(entries.id, entry!.id))

    await feed(ana, checkingFeed, [tx('t1', { date: '2026-12-02', amountCents: -6100 })])
    expect(await materialize()).toMatchObject({ created: 0, updated: 1 })
    const [after] = await entriesOf(ana)
    expect(after).toMatchObject({
      id: entry!.id,
      description: 'Farmácia',
      budgetGroup: 'essential',
      amountCents: -6100,
      startMonth: '2026-12-01',
      day: 2,
    })
    const paid = await db().select().from(occurrencePayments)
    expect(paid.map((p) => [p.month, p.paidOn])).toEqual([['2026-12-01', '2026-12-02']])
  })

  it('refuses every change of a bank entry the bank owns, and keeps the user fields', async () => {
    await feed(ana, checkingFeed, [tx('t1', { date: '2026-11-03' })])
    await map(ana, 'acc-checking', checkingId)
    await materialize()
    const [row] = await entriesOf(ana)
    const id = row!.id
    const fields: EntryFields = {
      kind: 'expense',
      description: 'Banco t1',
      amountCents: -5000,
      accountId: checkingId,
      toAccountId: null,
      categoryId: null,
      budgetGroup: null,
      tags: [],
      startMonth: '2026-11',
      day: 3,
      recurrence: 'none',
      repeatEvery: 1,
      monthBy: 'day',
      installments: null,
      endMonth: null,
      parts: [],
    }
    const locked = { ok: false, reason: 'bank_locked' }
    for (const patch of [
      { amountCents: -1 },
      { amountCents: 5000 },
      { kind: 'income' as const, amountCents: 5000 },
      { accountId: cardId },
      { day: 4 },
      { startMonth: '2026-12' },
      { recurrence: 'monthly' as const },
      { parts: [{ label: 'A', bps: 10000, day: 3, nextMonth: false }] },
    ]) {
      expect(await updateEntry(ana, id, { ...fields, ...patch }, null)).toEqual(locked)
    }
    expect(await deleteEntry(ana, id, null)).toEqual(locked)
    expect(await deleteEntry(ana, id, { month: '2026-11', scope: 'one' })).toEqual(locked)
    expect(
      await changeOccurrenceDay(ana, { entryId: id, month: '2026-11', day: 9, scope: 'one' }),
    ).toEqual(locked)
    const key = { entryId: id, month: '2026-11', partId: null }
    expect(await unmarkOccurrencePaid(ana, key)).toEqual(locked)
    expect(await markOccurrencePaid(ana, { ...key, paidOn: '2026-11-04' })).toEqual(locked)

    const edited = await updateEntry(
      ana,
      id,
      { ...fields, description: 'Farmácia', budgetGroup: 'essential', tags: ['saúde'] },
      null,
    )
    expect(edited.ok).toBe(true)
    const [after] = await entriesOf(ana)
    expect(after).toMatchObject({
      description: 'Farmácia',
      budgetGroup: 'essential',
      tags: ['saúde'],
      amountCents: -5000,
      day: 3,
    })
    expect(await db().select().from(occurrencePayments)).toHaveLength(1)

    // Undo of the edit restores the row and keeps it linked to the bank.
    if (!edited.ok || edited.undo === undefined) throw new Error('no undo token')
    expect(await undoLastAction(ana, edited.undo)).toEqual({ ok: true })
    expect((await linksOf(ana)).map((l) => l.entryId)).toEqual([id])
    expect(await materialize()).toMatchObject({ created: 0, removed: 0 })
  })

  it('deletes the entry of a transaction the bank removed', async () => {
    await feed(ana, checkingFeed, [tx('t1'), tx('t2')])
    await map(ana, 'acc-checking', checkingId)
    await materialize()

    await feed(ana, checkingFeed, [tx('t1')])
    expect(await materialize()).toMatchObject({ removed: 1 })
    expect((await entriesOf(ana)).map((e) => e.description)).toEqual(['Banco t1'])
    expect(await linksOf(ana)).toHaveLength(1)
  })

  it('pairs a card bill payment into one transfer, even when one side arrives later', async () => {
    await feed(ana, checkingFeed, [
      tx('pay', { amountCents: -30000, date: '2026-11-10', category: 'Credit card payment' }),
      // Same amount and distance, no signal: never a transfer.
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

    // A planned rent on the connected account, already past: the bank's past wins.
    await db()
      .insert(entries)
      .values({
        ...ana,
        kind: 'expense',
        description: 'Aluguel planejado',
        amountCents: -80000,
        accountId: checkingId,
        startMonth: '2026-11-01',
        day: 10,
        recurrence: 'none',
      })
    const ledger = await loadLedger(ana, { from: '2026-11', to: '2026-11' })
    expect(ledger.connectedAccountIds).toEqual([checkingId, cardId].sort())
    expect(ledger.entries.filter((e) => e.fromBank)).toHaveLength(4)
    const bia = await personalScope(db(), BIA)
    expect((await loadLedger(bia, { from: '2026-11', to: '2026-11' })).connectedAccountIds).toEqual(
      [],
    )
    const { months } = await projectLedger(ana, { from: '2026-11', to: '2026-11' }, TODAY)
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
