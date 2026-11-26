import { describe, expect, it } from 'vitest'
import { balanceSnapshot, monthEndBalances, monthTotalsOf } from './dashboard'
import { makeEntry } from './fixtures'
import { projectMonths } from './projection'

const accounts = [
  { id: 'checking', openingBalanceCents: 100000 },
  { id: 'va', openingBalanceCents: 20000 },
]

function project() {
  return projectMonths({
    entries: [
      makeEntry({ id: 'salary', kind: 'income', pot: null, amountCents: 500000, day: 5 }),
      makeEntry({ id: 'rent', amountCents: -400000, day: 10 }),
      makeEntry({ id: 'card', amountCents: -300000, day: 20 }),
      makeEntry({
        id: 'voucher',
        kind: 'income',
        pot: null,
        accountId: 'va',
        amountCents: 50000,
        day: 1,
      }),
    ],
    parts: [],
    overrides: [],
    accounts,
    months: ['2026-12', '2027-01'],
  })
}

describe('balanceSnapshot', () => {
  it('reads today, the month end and the lowest balance ahead over every account', () => {
    // dez: 120k + 50k (VA, 1st) + 500k (5th) − 400k (10th) − 300k (20th).
    expect(balanceSnapshot(project(), '2026-12-12')).toEqual({
      todayCents: 270000,
      monthEndCents: -30000,
      // jan: −30k + 50k + 500k − 400k − 300k = −180k on the 20th.
      lowestCents: -180000,
      lowestDate: '2027-01-20',
    })
  })

  it('counts what lands today and starts from the opening balance before anything lands', () => {
    expect(balanceSnapshot(project(), '2026-12-05')?.todayCents).toBe(670000)
    expect(balanceSnapshot(project(), '2026-12-01')?.todayCents).toBe(170000)
  })

  it('keeps today as the lowest when nothing ahead goes below it', () => {
    const results = projectMonths({
      entries: [makeEntry({ id: 'salary', kind: 'income', pot: null, amountCents: 1000, day: 20 })],
      parts: [],
      overrides: [],
      accounts,
      months: ['2026-12'],
    })
    expect(balanceSnapshot(results, '2026-12-10')).toMatchObject({
      todayCents: 120000,
      lowestCents: 120000,
      lowestDate: '2026-12-10',
    })
  })

  it('is null when the current month was not projected', () => {
    expect(balanceSnapshot(project(), '2030-01-01')).toBeNull()
  })
})

describe('monthEndBalances', () => {
  it('sums every account at the end of each month', () => {
    expect(monthEndBalances(project())).toEqual([
      { month: '2026-12', closingCents: -30000 },
      { month: '2027-01', closingCents: -180000 },
    ])
  })
})

describe('monthTotalsOf', () => {
  it('reads a projected month, zeros otherwise', () => {
    expect(monthTotalsOf(project(), '2026-12')).toMatchObject({ incomeCents: 550000 })
    expect(monthTotalsOf(project(), '2030-01')).toEqual({
      incomeCents: 0,
      expenseCents: 0,
      netCents: 0,
      byPot: {},
      unallocatedCents: 0,
    })
  })
})
