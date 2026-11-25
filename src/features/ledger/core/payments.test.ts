import { describe, expect, it } from 'vitest'
import { makeEntry, makeOverride, makePart, salarySplit } from './fixtures'
import { landingsIn, type Landing } from './occurrence'
import {
  addDays,
  groupPayables,
  keepPartIds,
  landingDate,
  payablesWindow,
  paymentFor,
  paymentStatus,
  splitPayments,
  stalePayments,
  type OccurrencePayment,
} from './payments'

const rent = makeEntry({ id: 'rent', description: 'Aluguel', day: 10, amountCents: 200000 })
const salary = makeEntry({
  id: 'salary',
  kind: 'income',
  pot: null,
  description: 'Salário',
  amountCents: 1000000,
})
const parts = salarySplit('salary')

function landing(entry = rent, month = '2026-11', index = 0): Landing {
  const all = landingsIn(entry, entry.id === 'salary' ? parts : [], [], month)
  const found = all[index]
  if (found === undefined) throw new Error('no landing')
  return found
}

function paid(patch: Partial<OccurrencePayment> = {}): OccurrencePayment {
  return { entryId: 'rent', month: '2026-11', partId: null, paidOn: '2026-11-09', ...patch }
}

describe('addDays', () => {
  it('crosses months, years and leap days', () => {
    expect(addDays('2026-11-28', 6)).toBe('2026-12-04')
    expect(addDays('2026-12-30', 2)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('paymentStatus', () => {
  it('is paid with a payment, else overdue before today and upcoming from today', () => {
    const l = landing()
    expect(landingDate(l)).toBe('2026-11-10')
    expect(paymentStatus(l, [paid()], '2026-11-30')).toBe('paid')
    expect(paymentStatus(l, [], '2026-11-11')).toBe('overdue')
    expect(paymentStatus(l, [], '2026-11-10')).toBe('upcoming')
    expect(paymentStatus(l, [paid({ month: '2026-10' })], '2026-11-24')).toBe('overdue')
  })

  it('keys split parts by part and competence (a next-month part lands later)', () => {
    // November: the advance of November and the rest of October land.
    const [advance, rest] = landingsIn(salary, parts, [], '2026-11')
    expect(rest?.part?.label).toBe('Saldo')
    expect(rest?.competence).toBe('2026-10')
    const payments = [paid({ entryId: 'salary', month: '2026-10', partId: 'salary-b' })]
    expect(paymentStatus(rest!, payments, '2026-11-15')).toBe('paid')
    expect(paymentStatus(advance!, payments, '2026-11-15')).toBe('upcoming')
    expect(paymentFor(advance!, payments)).toBeUndefined()
  })
})

describe('groupPayables', () => {
  const today = '2026-11-24'
  const bills = [
    makeEntry({ id: 'late', day: 3, amountCents: 1000 }),
    makeEntry({ id: 'today', day: 24, amountCents: 2000 }),
    makeEntry({ id: 'soon', kind: 'income', pot: null, day: 30, amountCents: 5000 }),
    makeEntry({
      id: 'move',
      kind: 'transfer',
      pot: null,
      toAccountId: 'savings',
      day: 28,
      amountCents: 700,
    }),
    makeEntry({ id: 'paid', day: 1, amountCents: 3000 }),
  ]
  const november = bills.flatMap((e) => landingsIn(e, [], [], '2026-11'))
  const december = bills.flatMap((e) => landingsIn(e, [], [], '2026-12'))
  const january = bills.flatMap((e) => landingsIn(e, [], [], '2027-01'))
  const payments = [paid({ entryId: 'paid', month: '2026-11', paidOn: '2026-11-01' })]

  it('groups unpaid occurrences by date with totals per kind', () => {
    const groups = groupPayables([...november, ...december, ...january], payments, today)
    expect(groups.map((g) => g.key)).toEqual(['overdue', 'next7', 'nextMonth'])
    const [overdue, next7, nextMonth] = groups
    expect(overdue?.items.map((i) => i.landing.entry.id)).toEqual(['late'])
    expect(overdue?.items[0]?.status).toBe('overdue')
    expect(overdue?.label).toBe('Atrasadas')
    // today..today+6 (24 to 30 Nov); November's "paid" is out, December's is not.
    expect(next7?.items.map((i) => i.date)).toEqual(['2026-11-24', '2026-11-28', '2026-11-30'])
    expect(next7).toMatchObject({ incomeCents: 5000, expenseCents: 2000, transferCents: 700 })
    expect(nextMonth?.items.map((i) => i.landing.entry.id)).toEqual([
      'paid',
      'late',
      'today',
      'move',
      'soon',
    ])
  })

  it('puts the rest of the month apart from the next 7 days', () => {
    const groups = groupPayables(november, [], '2026-11-02')
    expect(groups.map((g) => [g.key, g.items.map((i) => i.landing.entry.id)])).toEqual([
      ['overdue', ['paid']],
      ['next7', ['late']],
      ['restOfMonth', ['today', 'move', 'soon']],
    ])
  })

  it('optionally lists the paid occurrences of the current month', () => {
    const groups = groupPayables(november, payments, today, { includePaid: true })
    const last = groups.at(-1)
    expect(last?.key).toBe('paid')
    expect(last?.items).toEqual([
      expect.objectContaining({ status: 'paid', payment: payments[0], date: '2026-11-01' }),
    ])
    expect(groupPayables(november, payments, today).some((g) => g.key === 'paid')).toBe(false)
  })

  it('ignores occurrences beyond next month', () => {
    expect(groupPayables(january, [], today)).toEqual([])
  })
})

describe('payablesWindow', () => {
  it('starts at the count start, never more than 12 months back, and ends next month', () => {
    expect(payablesWindow('2026-09', '2026-11')).toEqual({ from: '2026-09', to: '2026-12' })
    expect(payablesWindow(null, '2026-11')).toEqual({ from: '2026-11', to: '2026-12' })
    expect(payablesWindow('2027-03', '2026-11')).toEqual({ from: '2026-11', to: '2026-12' })
    expect(payablesWindow('2024-01', '2026-11')).toEqual({ from: '2025-11', to: '2026-12' })
  })
})

describe('keepPartIds', () => {
  it('reuses the previous ids by position and keeps new ids for extra parts', () => {
    const previous = [makePart({ id: 'b', sort: 1 }), makePart({ id: 'a', sort: 0 })]
    const next = [makePart({ id: 'n1' }), makePart({ id: 'n2' }), makePart({ id: 'n3' })]
    expect(keepPartIds(next, previous).map((p) => p.id)).toEqual(['a', 'b', 'n3'])
  })
})

describe('stalePayments', () => {
  it('flags months without an occurrence, skipped months and mismatched parts', () => {
    const entry = makeEntry({ id: 'rent', startMonth: '2026-10', endMonth: '2026-12' })
    const payments = [
      paid({ month: '2026-09' }),
      paid({ month: '2026-10' }),
      paid({ month: '2026-11' }),
      paid({ month: '2027-01' }),
      paid({ entryId: 'other', month: '2026-05' }),
    ]
    const overrides = [makeOverride({ entryId: 'rent', month: '2026-11', skipped: true })]
    expect(stalePayments(entry, [], overrides, payments).map((p) => p.month)).toEqual([
      '2026-09',
      '2026-11',
      '2027-01',
    ])
    const split = [makePart({ id: 'p1', entryId: 'rent' })]
    expect(
      stalePayments(
        entry,
        split,
        [],
        [
          paid({ month: '2026-10' }),
          paid({ month: '2026-10', partId: 'p1' }),
          paid({ month: '2026-10', partId: 'gone' }),
        ],
      ).map((p) => p.partId),
    ).toEqual([null, 'gone'])
  })
})

describe('splitPayments', () => {
  it('moves payments from the split month to the new entry and its copied parts', () => {
    const from = [makePart({ id: 'a', sort: 0 }), makePart({ id: 'b', sort: 1 })]
    const to = [makePart({ id: 'a2', sort: 0 }), makePart({ id: 'b2', sort: 1 })]
    const payments = [
      paid({ month: '2026-10', partId: 'a' }),
      paid({ month: '2026-11', partId: 'b' }),
      paid({ month: '2026-12', partId: null }),
      paid({ month: '2026-12', partId: 'unknown' }),
      paid({ entryId: 'other', month: '2026-12' }),
    ]
    expect(
      splitPayments(
        payments,
        { fromEntryId: 'rent', toEntryId: 'new', month: '2026-11' },
        from,
        to,
      ),
    ).toEqual([
      paid({ month: '2026-10', partId: 'a' }),
      paid({ entryId: 'new', month: '2026-11', partId: 'b2' }),
      paid({ entryId: 'new', month: '2026-12', partId: null }),
      paid({ entryId: 'other', month: '2026-12' }),
    ])
  })
})
