import { fluxiDb, seedUser, truncateFluxiTables } from '@/db'
import { entries, entryOverrides, entryParts, occurrencePayments, undoSnapshots } from '@/db/schema'
import type { EntryFields } from '@/features/ledger/core/schemas'
import { eq, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  changeOccurrenceDay,
  createAccount,
  createBank,
  createEntry,
  deleteEntry,
  updateEntry,
} from './ledger.write'
import { markOccurrencePaid, unmarkOccurrencePaid } from './payments.write'
import { forgetUndo, undoLastAction } from './undo.write'
import type { WriteResult } from './write-base'

const ANA = '11111111-1111-4111-8111-111111111111'
const BIA = '22222222-2222-4222-8222-222222222222'

const db = () => fluxiDb.db()

let accountId = ''

function expense(patch: Partial<EntryFields> = {}): EntryFields {
  return {
    kind: 'expense',
    description: 'Aluguel',
    amountCents: -200000,
    accountId,
    toAccountId: null,
    categoryId: null,
    pot: 'essential',
    tags: ['casa'],
    startMonth: '2026-12',
    day: 10,
    recurrence: 'monthly',
    repeatEvery: 1,
    monthBy: 'day',
    installments: null,
    endMonth: null,
    parts: [],
    ...patch,
  }
}

/** Every row of the user's ledger (dates and timestamps included), to compare before/after. */
async function ledgerOf(userId: string) {
  const byId = <T extends { id: string }>(rows: T[]) =>
    rows.sort((a, b) => a.id.localeCompare(b.id))
  return {
    entries: byId(await db().select().from(entries).where(eq(entries.userId, userId))),
    parts: byId(await db().select().from(entryParts).where(eq(entryParts.userId, userId))),
    overrides: (
      await db().select().from(entryOverrides).where(eq(entryOverrides.userId, userId))
    ).sort((a, b) => `${a.entryId}${a.month}`.localeCompare(`${b.entryId}${b.month}`)),
    payments: byId(
      await db().select().from(occurrencePayments).where(eq(occurrencePayments.userId, userId)),
    ),
  }
}

function tokenOf(result: WriteResult): string {
  if (!result.ok || result.undo === undefined) throw new Error('not undoable')
  return result.undo
}

/** A monthly rent split 40/60, paid in December, skipped in February. */
async function seedSeries(): Promise<string> {
  const id = randomUUID()
  await createEntry(
    ANA,
    id,
    expense({
      parts: [
        { label: 'Adiantamento', bps: 4000, day: 20, nextMonth: false },
        { label: 'Resto', bps: 6000, day: 5, nextMonth: true },
      ],
    }),
  )
  const [part] = await db().select().from(entryParts).where(eq(entryParts.entryId, id))
  await markOccurrencePaid(ANA, {
    entryId: id,
    month: '2026-12',
    partId: part?.id ?? null,
    paidOn: '2026-12-20',
  })
  await deleteEntry(ANA, id, { month: '2027-02', scope: 'one' })
  return id
}

beforeAll(async () => {
  await fluxiDb.migrate()
})

beforeEach(async () => {
  await truncateFluxiTables(db())
  await seedUser(db(), { id: ANA, email: 'ana@example.com' })
  await seedUser(db(), { id: BIA, email: 'bia@example.com' })
  const bankId = randomUUID()
  accountId = randomUUID()
  await createBank(ANA, { id: bankId, name: 'BTG' })
  await createAccount(ANA, {
    id: accountId,
    bankId,
    name: 'Conta',
    type: 'checking',
    openingBalanceCents: 0,
  })
})

afterAll(async () => {
  await fluxiDb.close()
})

describe('undo', () => {
  it('removes a created entry, and a replay of the create offers no undo', async () => {
    const id = randomUUID()
    const created = await createEntry(ANA, id, expense({ recurrence: 'none' }))
    expect(await createEntry(ANA, id, expense({ recurrence: 'none' }))).toEqual({ ok: true })
    expect(await undoLastAction(ANA, tokenOf(created))).toEqual({ ok: true })
    expect((await ledgerOf(ANA)).entries).toEqual([])
  })

  it('brings back a series edited from one month on, removing the split it created', async () => {
    const id = await seedSeries()
    const before = await ledgerOf(ANA)
    const edited = await updateEntry(
      ANA,
      id,
      expense({
        amountCents: -250000,
        startMonth: '2027-01',
        parts: [
          { label: 'Adiantamento', bps: 4000, day: 20, nextMonth: false },
          { label: 'Resto', bps: 6000, day: 5, nextMonth: true },
        ],
      }),
      { month: '2027-01', scope: 'future' },
    )
    expect((await ledgerOf(ANA)).entries).toHaveLength(2)
    expect(await undoLastAction(ANA, tokenOf(edited))).toEqual({ ok: true })
    expect(await ledgerOf(ANA)).toEqual(before)
  })

  it('brings back a moved occurrence', async () => {
    const id = randomUUID()
    await createEntry(ANA, id, expense())
    const before = await ledgerOf(ANA)
    const moved = await changeOccurrenceDay(ANA, {
      entryId: id,
      month: '2027-01',
      day: 15,
      scope: 'one',
    })
    expect(await undoLastAction(ANA, tokenOf(moved))).toEqual({ ok: true })
    expect(await ledgerOf(ANA)).toEqual(before)
  })

  it('brings back a deleted series with its parts, overrides and payments', async () => {
    const id = await seedSeries()
    const before = await ledgerOf(ANA)
    const deleted = await deleteEntry(ANA, id, null)
    expect((await ledgerOf(ANA)).entries).toEqual([])
    expect(await undoLastAction(ANA, tokenOf(deleted))).toEqual({ ok: true })
    expect(await ledgerOf(ANA)).toEqual(before)
  })

  it('brings back one deleted occurrence and the end of a series', async () => {
    const id = await seedSeries()
    const before = await ledgerOf(ANA)
    const one = await deleteEntry(ANA, id, { month: '2027-01', scope: 'one' })
    expect(await undoLastAction(ANA, tokenOf(one))).toEqual({ ok: true })
    expect(await ledgerOf(ANA)).toEqual(before)
    const future = await deleteEntry(ANA, id, { month: '2027-03', scope: 'future' })
    expect(await undoLastAction(ANA, tokenOf(future))).toEqual({ ok: true })
    expect(await ledgerOf(ANA)).toEqual(before)
  })

  it('unmarks a payment and marks it again', async () => {
    const id = randomUUID()
    await createEntry(ANA, id, expense({ recurrence: 'none' }))
    const before = await ledgerOf(ANA)
    const key = { entryId: id, month: '2026-12', partId: null }
    const paid = await markOccurrencePaid(ANA, { ...key, paidOn: '2026-12-10' })
    expect(await undoLastAction(ANA, tokenOf(paid))).toEqual({ ok: true })
    expect(await ledgerOf(ANA)).toEqual(before)

    await markOccurrencePaid(ANA, { ...key, paidOn: '2026-12-10' })
    const paidState = await ledgerOf(ANA)
    const unpaid = await unmarkOccurrencePaid(ANA, key)
    expect(await undoLastAction(ANA, tokenOf(unpaid))).toEqual({ ok: true })
    expect(await ledgerOf(ANA)).toEqual(paidState)
    // Unmarking what is not paid changes nothing and offers no undo.
    expect(await unmarkOccurrencePaid(ANA, { ...key, month: '2027-01' })).toEqual({ ok: true })
  })

  it('only undoes the last action, once, for its own user, within the window', async () => {
    const first = await createEntry(ANA, randomUUID(), expense())
    const second = await createEntry(ANA, randomUUID(), expense())
    expect(await undoLastAction(ANA, tokenOf(first))).toEqual({
      ok: false,
      reason: 'undo_expired',
    })
    expect(await undoLastAction(BIA, tokenOf(second))).toEqual({
      ok: false,
      reason: 'undo_expired',
    })
    expect((await ledgerOf(ANA)).entries).toHaveLength(2)

    await db()
      .update(undoSnapshots)
      .set({ createdAt: sql`now() - interval '3 minutes'` })
    expect(await undoLastAction(ANA, tokenOf(second))).toEqual({
      ok: false,
      reason: 'undo_expired',
    })

    // A new action sweeps the expired records of every user.
    const third = await createEntry(ANA, randomUUID(), expense())
    expect(await db().select().from(undoSnapshots)).toHaveLength(1)
    expect(await undoLastAction(ANA, tokenOf(third))).toEqual({ ok: true })
    expect(await undoLastAction(ANA, tokenOf(third))).toEqual({
      ok: false,
      reason: 'undo_expired',
    })
  })

  it('forgets a record once its toast closed, but never a newer one', async () => {
    const first = await createEntry(ANA, randomUUID(), expense())
    const second = await createEntry(ANA, randomUUID(), expense())
    await forgetUndo(ANA, tokenOf(first))
    expect(await db().select().from(undoSnapshots)).toHaveLength(1)
    await forgetUndo(ANA, tokenOf(second))
    expect(await db().select().from(undoSnapshots)).toEqual([])
  })
})
