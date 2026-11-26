import { fluxiDb, personalScope, seedUser, truncateFluxiTables } from '@/db'
import { entries, entryOverrides, entryParts, occurrencePayments, undoSnapshots } from '@/db/schema'
import type { EntryFields } from '@/features/ledger/core/schemas'
import type { Scope } from '@/features/spaces/core/space'
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

let anaScope: Scope
let biaScope: Scope

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
    budgetGroup: 'essential',
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
async function ledgerOf(scope: Scope) {
  const byId = <T extends { id: string }>(rows: T[]) =>
    rows.sort((a, b) => a.id.localeCompare(b.id))
  return {
    entries: byId(await db().select().from(entries).where(eq(entries.spaceId, scope.spaceId))),
    parts: byId(await db().select().from(entryParts).where(eq(entryParts.spaceId, scope.spaceId))),
    overrides: (
      await db().select().from(entryOverrides).where(eq(entryOverrides.spaceId, scope.spaceId))
    ).sort((a, b) => `${a.entryId}${a.month}`.localeCompare(`${b.entryId}${b.month}`)),
    payments: byId(
      await db()
        .select()
        .from(occurrencePayments)
        .where(eq(occurrencePayments.spaceId, scope.spaceId)),
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
    anaScope,
    id,
    expense({
      parts: [
        { label: 'Adiantamento', bps: 4000, day: 20, nextMonth: false },
        { label: 'Resto', bps: 6000, day: 5, nextMonth: true },
      ],
    }),
  )
  const [part] = await db().select().from(entryParts).where(eq(entryParts.entryId, id))
  await markOccurrencePaid(anaScope, {
    entryId: id,
    month: '2026-12',
    partId: part?.id ?? null,
    paidOn: '2026-12-20',
  })
  await deleteEntry(anaScope, id, { month: '2027-02', scope: 'one' })
  return id
}

beforeAll(async () => {
  await fluxiDb.migrate()
})

beforeEach(async () => {
  await truncateFluxiTables(db())
  await seedUser(db(), { id: ANA, email: 'ana@example.com' })
  await seedUser(db(), { id: BIA, email: 'bia@example.com' })
  anaScope = await personalScope(db(), ANA)
  biaScope = await personalScope(db(), BIA)
  const bankId = randomUUID()
  accountId = randomUUID()
  await createBank(anaScope, { id: bankId, name: 'BTG' })
  await createAccount(anaScope, {
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
    const created = await createEntry(anaScope, id, expense({ recurrence: 'none' }))
    expect(await createEntry(anaScope, id, expense({ recurrence: 'none' }))).toEqual({ ok: true })
    expect(await undoLastAction(anaScope, tokenOf(created))).toEqual({ ok: true })
    expect((await ledgerOf(anaScope)).entries).toEqual([])
  })

  it('brings back a series edited from one month on, removing the split it created', async () => {
    const id = await seedSeries()
    const before = await ledgerOf(anaScope)
    const edited = await updateEntry(
      anaScope,
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
    expect((await ledgerOf(anaScope)).entries).toHaveLength(2)
    expect(await undoLastAction(anaScope, tokenOf(edited))).toEqual({ ok: true })
    expect(await ledgerOf(anaScope)).toEqual(before)
  })

  it('brings back a moved occurrence', async () => {
    const id = randomUUID()
    await createEntry(anaScope, id, expense())
    const before = await ledgerOf(anaScope)
    const moved = await changeOccurrenceDay(anaScope, {
      entryId: id,
      month: '2027-01',
      day: 15,
      scope: 'one',
    })
    expect(await undoLastAction(anaScope, tokenOf(moved))).toEqual({ ok: true })
    expect(await ledgerOf(anaScope)).toEqual(before)
  })

  it('brings back a deleted series with its parts, overrides and payments', async () => {
    const id = await seedSeries()
    const before = await ledgerOf(anaScope)
    const deleted = await deleteEntry(anaScope, id, null)
    expect((await ledgerOf(anaScope)).entries).toEqual([])
    expect(await undoLastAction(anaScope, tokenOf(deleted))).toEqual({ ok: true })
    expect(await ledgerOf(anaScope)).toEqual(before)
  })

  it('brings back one deleted occurrence and the end of a series', async () => {
    const id = await seedSeries()
    const before = await ledgerOf(anaScope)
    const one = await deleteEntry(anaScope, id, { month: '2027-01', scope: 'one' })
    expect(await undoLastAction(anaScope, tokenOf(one))).toEqual({ ok: true })
    expect(await ledgerOf(anaScope)).toEqual(before)
    const future = await deleteEntry(anaScope, id, { month: '2027-03', scope: 'future' })
    expect(await undoLastAction(anaScope, tokenOf(future))).toEqual({ ok: true })
    expect(await ledgerOf(anaScope)).toEqual(before)
  })

  it('unmarks a payment and marks it again', async () => {
    const id = randomUUID()
    await createEntry(anaScope, id, expense({ recurrence: 'none' }))
    const before = await ledgerOf(anaScope)
    const key = { entryId: id, month: '2026-12', partId: null }
    const paid = await markOccurrencePaid(anaScope, { ...key, paidOn: '2026-12-10' })
    expect(await undoLastAction(anaScope, tokenOf(paid))).toEqual({ ok: true })
    expect(await ledgerOf(anaScope)).toEqual(before)

    await markOccurrencePaid(anaScope, { ...key, paidOn: '2026-12-10' })
    const paidState = await ledgerOf(anaScope)
    const unpaid = await unmarkOccurrencePaid(anaScope, key)
    expect(await undoLastAction(anaScope, tokenOf(unpaid))).toEqual({ ok: true })
    expect(await ledgerOf(anaScope)).toEqual(paidState)
    // Unmarking what is not paid changes nothing and offers no undo.
    expect(await unmarkOccurrencePaid(anaScope, { ...key, month: '2027-01' })).toEqual({ ok: true })
  })

  it('only undoes the last action, once, for its own user, within the window', async () => {
    const first = await createEntry(anaScope, randomUUID(), expense())
    const second = await createEntry(anaScope, randomUUID(), expense())
    expect(await undoLastAction(anaScope, tokenOf(first))).toEqual({
      ok: false,
      reason: 'undo_expired',
    })
    expect(await undoLastAction(biaScope, tokenOf(second))).toEqual({
      ok: false,
      reason: 'undo_expired',
    })
    expect((await ledgerOf(anaScope)).entries).toHaveLength(2)

    await db()
      .update(undoSnapshots)
      .set({ createdAt: sql`now() - interval '3 minutes'` })
    expect(await undoLastAction(anaScope, tokenOf(second))).toEqual({
      ok: false,
      reason: 'undo_expired',
    })

    // A new action sweeps the expired records of every user.
    const third = await createEntry(anaScope, randomUUID(), expense())
    expect(await db().select().from(undoSnapshots)).toHaveLength(1)
    expect(await undoLastAction(anaScope, tokenOf(third))).toEqual({ ok: true })
    expect(await undoLastAction(anaScope, tokenOf(third))).toEqual({
      ok: false,
      reason: 'undo_expired',
    })
  })

  it('forgets a record once its toast closed, but never a newer one', async () => {
    const first = await createEntry(anaScope, randomUUID(), expense())
    const second = await createEntry(anaScope, randomUUID(), expense())
    await forgetUndo(anaScope, tokenOf(first))
    expect(await db().select().from(undoSnapshots)).toHaveLength(1)
    await forgetUndo(anaScope, tokenOf(second))
    expect(await db().select().from(undoSnapshots)).toEqual([])
  })
})
