import { fluxiDb, seedUser, truncateFluxiTables } from '@/db'
import { entries, entryParts, occurrencePayments } from '@/db/schema'
import type { EntryFields } from '@/features/ledger/core/schemas'
import { asc, eq, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { loadLedger } from './ledger.repo'
import {
  changeOccurrenceDay,
  createAccount,
  createBank,
  createEntry,
  deleteEntry,
  setCountFrom,
  updateEntry,
} from './ledger.write'
import { markOccurrencePaid, unmarkOccurrencePaid } from './payments.write'
import { projectLedger } from './projection'

const ANA = '11111111-1111-4111-8111-111111111111'
const BIA = '22222222-2222-4222-8222-222222222222'
const WINDOW = { from: '2026-12', to: '2027-04' }

const db = () => fluxiDb.db()

async function setupUser(userId: string): Promise<string> {
  const bankId = randomUUID()
  const accountId = randomUUID()
  await createBank(userId, { id: bankId, name: 'BTG' })
  await createAccount(userId, {
    id: accountId,
    bankId,
    name: 'Conta',
    type: 'checking',
    openingBalanceCents: 100000,
  })
  await setCountFrom(userId, '2026-12')
  return accountId
}

function rent(accountId: string, patch: Partial<EntryFields> = {}): EntryFields {
  return {
    kind: 'expense',
    description: 'Aluguel',
    amountCents: 200000,
    accountId,
    toAccountId: null,
    categoryId: null,
    pot: 'essential',
    tags: [],
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

const SPLIT: EntryFields['parts'] = [
  { label: 'Adiantamento', bps: 4000, day: 20, nextMonth: false },
  { label: 'Saldo', bps: 6000, day: 5, nextMonth: true },
]

async function paymentRows() {
  // Deterministic order: payments of one occurrence can share month and paidOn
  // (one per part), so ties fall back to the part's position, then the entry.
  const rows = await db()
    .select({
      userId: occurrencePayments.userId,
      entryId: occurrencePayments.entryId,
      month: occurrencePayments.month,
      partId: occurrencePayments.partId,
      paidOn: occurrencePayments.paidOn,
    })
    .from(occurrencePayments)
    .leftJoin(entryParts, eq(entryParts.id, occurrencePayments.partId))
    .orderBy(
      asc(occurrencePayments.month),
      asc(occurrencePayments.paidOn),
      sql`${entryParts.sort} asc nulls first`,
      asc(occurrencePayments.entryId),
    )
  return rows.map((r) => ({
    userId: r.userId,
    entryId: r.entryId,
    month: r.month,
    partId: r.partId,
    paidOn: r.paidOn,
  }))
}

async function partIds(entryId: string): Promise<string[]> {
  const rows = await db()
    .select({ id: entryParts.id })
    .from(entryParts)
    .where(eq(entryParts.entryId, entryId))
    .orderBy(asc(entryParts.sort))
  return rows.map((r) => r.id)
}

let anaAccount: string
let biaAccount: string
let entryId: string

beforeAll(async () => {
  await fluxiDb.migrate()
})

beforeEach(async () => {
  await truncateFluxiTables(db())
  await seedUser(db(), { id: ANA, email: 'ana@example.com' })
  await seedUser(db(), { id: BIA, email: 'bia@example.com' })
  anaAccount = await setupUser(ANA)
  biaAccount = await setupUser(BIA)
  entryId = randomUUID()
  await createEntry(ANA, entryId, rent(anaAccount))
})

afterAll(async () => {
  await fluxiDb.close()
})

describe('markOccurrencePaid / unmarkOccurrencePaid', () => {
  it('marks idempotently (a replay only moves the date) and unmarks', async () => {
    const key = { entryId, month: '2027-01', partId: null }
    await expect(markOccurrencePaid(ANA, { ...key, paidOn: '2027-01-09' })).resolves.toMatchObject({
      ok: true,
    })
    await expect(markOccurrencePaid(ANA, { ...key, paidOn: '2027-01-11' })).resolves.toMatchObject({
      ok: true,
    })
    expect(await paymentRows()).toEqual([
      { userId: ANA, entryId, month: '2027-01-01', partId: null, paidOn: '2027-01-11' },
    ])
    const ledger = await loadLedger(ANA, WINDOW)
    expect(ledger.payments).toEqual([{ ...key, paidOn: '2027-01-11' }])

    await expect(unmarkOccurrencePaid(ANA, key)).resolves.toMatchObject({ ok: true })
    await expect(unmarkOccurrencePaid(ANA, key)).resolves.toMatchObject({ ok: true })
    expect(await paymentRows()).toEqual([])
  })

  it('does not change the projected balance', async () => {
    const before = await projectLedger(ANA, WINDOW)
    await markOccurrencePaid(ANA, { entryId, month: '2026-12', partId: null, paidOn: '2026-12-10' })
    const after = await projectLedger(ANA, WINDOW)
    expect(after.months.map((m) => m.closingBalances)).toEqual(
      before.months.map((m) => m.closingBalances),
    )
  })

  it('refuses another user’s entry and never touches their payments', async () => {
    const key = { entryId, month: '2026-12', partId: null }
    await expect(markOccurrencePaid(BIA, { ...key, paidOn: '2026-12-10' })).resolves.toEqual({
      ok: false,
      reason: 'not_found',
    })
    await markOccurrencePaid(ANA, { ...key, paidOn: '2026-12-10' })
    await unmarkOccurrencePaid(BIA, key)
    expect(await paymentRows()).toHaveLength(1)
    expect((await loadLedger(BIA, WINDOW)).payments).toEqual([])
  })

  it('the database refuses a payment pointing at another user’s entry', async () => {
    const insert = db()
      .insert(occurrencePayments)
      .values({ userId: BIA, entryId, month: '2026-12-01', paidOn: '2026-12-10' })
    await expect(insert).rejects.toMatchObject({
      cause: { code: '23503', constraint: 'occurrence_payments_entry_fk' },
    })
  })

  it('refuses a month without an occurrence or a skipped one', async () => {
    const paidOn = '2026-12-10'
    await expect(
      markOccurrencePaid(ANA, { entryId, month: '2026-11', partId: null, paidOn }),
    ).resolves.toEqual({ ok: false, reason: 'no_occurrence' })
    await deleteEntry(ANA, entryId, { month: '2027-01', scope: 'one' })
    await expect(
      markOccurrencePaid(ANA, { entryId, month: '2027-01', partId: null, paidOn }),
    ).resolves.toEqual({ ok: false, reason: 'no_occurrence' })
  })

  it('pays each part of a split entry separately and refuses the whole/foreign parts', async () => {
    const salary = randomUUID()
    await createEntry(ANA, salary, rent(anaAccount, { kind: 'income', pot: null, parts: SPLIT }))
    const [advance, rest] = await partIds(salary)
    const paidOn = '2026-12-20'
    await expect(
      markOccurrencePaid(ANA, { entryId: salary, month: '2026-12', partId: null, paidOn }),
    ).resolves.toEqual({ ok: false, reason: 'no_occurrence' })
    await expect(
      markOccurrencePaid(ANA, { entryId, month: '2026-12', partId: advance ?? null, paidOn }),
    ).resolves.toEqual({ ok: false, reason: 'no_occurrence' })
    await markOccurrencePaid(ANA, { entryId: salary, month: '2026-12', partId: advance!, paidOn })
    await markOccurrencePaid(ANA, {
      entryId: salary,
      month: '2026-12',
      partId: rest!,
      paidOn: '2027-01-05',
    })
    expect((await paymentRows()).map((p) => p.partId)).toEqual([advance, rest])
    // The database itself refuses a part of another entry.
    const foreignPart = db()
      .insert(occurrencePayments)
      .values({ userId: ANA, entryId, month: '2026-12-01', partId: advance!, paidOn })
    await expect(foreignPart).rejects.toMatchObject({
      cause: { code: '23503', constraint: 'occurrence_payments_part_fk' },
    })
  })
})

describe('payments under scoped edits and deletes', () => {
  async function payMonths(months: string[]) {
    for (const month of months) {
      await markOccurrencePaid(ANA, { entryId, month, partId: null, paidOn: `${month}-10` })
    }
  }

  it('deleting one occurrence removes its payment only', async () => {
    await payMonths(['2026-12', '2027-01'])
    await deleteEntry(ANA, entryId, { month: '2027-01', scope: 'one' })
    expect((await paymentRows()).map((p) => p.month)).toEqual(['2026-12-01'])
  })

  it('deleting "future" removes the payments from that month on', async () => {
    await payMonths(['2026-12', '2027-01', '2027-02'])
    await deleteEntry(ANA, entryId, { month: '2027-01', scope: 'future' })
    expect((await paymentRows()).map((p) => p.month)).toEqual(['2026-12-01'])
  })

  it('deleting the series removes every payment', async () => {
    await payMonths(['2026-12', '2027-01'])
    await deleteEntry(ANA, entryId, { month: '2027-01', scope: 'all' })
    expect(await paymentRows()).toEqual([])
  })

  it('a "future" split moves the payments from the split month to the new entry', async () => {
    await payMonths(['2026-12', '2027-01', '2027-02'])
    await updateEntry(
      ANA,
      entryId,
      rent(anaAccount, { amountCents: 210000, startMonth: '2027-01' }),
      {
        month: '2027-01',
        scope: 'future',
      },
    )
    const rows = await db().select().from(entries).orderBy(asc(entries.startMonth))
    const split = rows.find((r) => r.id !== entryId)?.id
    expect(split).toBeDefined()
    expect((await paymentRows()).map((p) => [p.entryId, p.month])).toEqual([
      [entryId, '2026-12-01'],
      [split, '2027-01-01'],
      [split, '2027-02-01'],
    ])
  })

  it('a "future" day change on a split entry moves part payments to the copied parts', async () => {
    const salary = randomUUID()
    await createEntry(ANA, salary, rent(anaAccount, { kind: 'income', pot: null, parts: SPLIT }))
    const [advance, rest] = await partIds(salary)
    for (const month of ['2026-12', '2027-01']) {
      await markOccurrencePaid(ANA, {
        entryId: salary,
        month,
        partId: advance!,
        paidOn: '2027-01-01',
      })
      await markOccurrencePaid(ANA, { entryId: salary, month, partId: rest!, paidOn: '2027-01-01' })
    }
    await updateEntry(
      ANA,
      salary,
      rent(anaAccount, {
        kind: 'income',
        pot: null,
        parts: SPLIT,
        amountCents: 300000,
        startMonth: '2027-01',
      }),
      { month: '2027-01', scope: 'future' },
    )
    const split = (await db().select().from(entries).where(eq(entries.startMonth, '2027-01-01')))[0]
      ?.id
    const [newAdvance, newRest] = await partIds(split!)
    // The original kept its part ids (edited in place), so December stays paid.
    expect(await partIds(salary)).toEqual([advance, rest])
    expect(
      (await paymentRows())
        .filter((p) => p.entryId !== entryId)
        .map((p) => [p.entryId, p.month, p.partId]),
    ).toEqual([
      [salary, '2026-12-01', advance],
      [salary, '2026-12-01', rest],
      [split, '2027-01-01', newAdvance],
      [split, '2027-01-01', newRest],
    ])
  })

  it('editing the series keeps payments of months that still occur', async () => {
    await payMonths(['2026-12', '2027-02'])
    // Starting later drops December's occurrence (and its payment).
    await updateEntry(ANA, entryId, rent(anaAccount, { startMonth: '2027-01' }), null)
    expect((await paymentRows()).map((p) => p.month)).toEqual(['2027-02-01'])
    await changeOccurrenceDay(ANA, { entryId, month: '2027-02', day: 12, scope: 'one' })
    expect((await paymentRows()).map((p) => p.month)).toEqual(['2027-02-01'])
  })

  it('splitting an entry into parts drops its whole-occurrence payments', async () => {
    await payMonths(['2026-12'])
    await updateEntry(ANA, entryId, rent(anaAccount, { parts: SPLIT }), null)
    expect(await paymentRows()).toEqual([])
  })

  it('cascades with the user, leaving the other user’s payments', async () => {
    await payMonths(['2026-12'])
    const biaEntry = randomUUID()
    await createEntry(BIA, biaEntry, rent(biaAccount))
    await markOccurrencePaid(BIA, {
      entryId: biaEntry,
      month: '2026-12',
      partId: null,
      paidOn: '2026-12-10',
    })
    await db().execute(sql`delete from auth.users where id = ${ANA}`)
    expect((await paymentRows()).map((p) => p.userId)).toEqual([BIA])
  })
})
