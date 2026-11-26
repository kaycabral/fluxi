import { describe, expect, it } from 'vitest'
import {
  accountBalancesOn,
  balanceSnapshot,
  bankBalancesOn,
  monthEndBalances,
  monthTotalsOf,
  withConnectedBanks,
} from './dashboard'
import { makeEntry } from './fixtures'
import { projectMonths } from './projection'

const accounts = [
  { id: 'checking', openingBalanceCents: 100000 },
  { id: 'va', openingBalanceCents: 20000 },
]

function project() {
  return projectMonths({
    entries: [
      makeEntry({ id: 'salary', kind: 'income', budgetGroup: null, amountCents: 500000, day: 5 }),
      makeEntry({ id: 'rent', amountCents: -400000, day: 10 }),
      makeEntry({ id: 'card', amountCents: -300000, day: 20 }),
      makeEntry({
        id: 'voucher',
        kind: 'income',
        budgetGroup: null,
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
      entries: [
        makeEntry({ id: 'salary', kind: 'income', budgetGroup: null, amountCents: 1000, day: 20 }),
      ],
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
      byBudgetGroup: {},
      unallocatedCents: 0,
    })
  })
})

describe('accountBalancesOn', () => {
  it('sums each account up to the day, transfers on both sides', () => {
    const [december] = projectMonths({
      entries: [
        makeEntry({ id: 'rent', amountCents: -400000, day: 10, startMonth: '2026-12' }),
        makeEntry({
          id: 'move',
          kind: 'transfer',
          budgetGroup: null,
          amountCents: -1000,
          day: 5,
          toAccountId: 'va',
          startMonth: '2026-12',
        }),
      ],
      parts: [],
      overrides: [],
      accounts,
      months: ['2026-12'],
    })
    if (december === undefined) throw new Error('no month')
    expect(accountBalancesOn(december, 9)).toEqual({ checking: 99000, va: 21000 })
    expect(accountBalancesOn(december, 10)).toEqual({ checking: -301000, va: 21000 })
  })
})

describe('bankBalancesOn', () => {
  it('sums the counted accounts by bank, highest first', () => {
    const results = projectMonths({
      entries: [makeEntry({ id: 'rent', amountCents: -400000, day: 10, startMonth: '2026-12' })],
      parts: [],
      overrides: [],
      accounts: [...accounts, { id: 'savings', openingBalanceCents: 5000 }],
      months: ['2026-12'],
    })
    const banks = [
      { id: 'b1', name: 'Itaú' },
      { id: 'b2', name: 'Caju' },
    ]
    const owned = [
      { id: 'checking', bankId: 'b1' },
      { id: 'savings', bankId: 'b1' },
      { id: 'va', bankId: 'b2' },
      { id: 'archived', bankId: 'b3' },
    ]
    expect(bankBalancesOn(results, '2026-12-09', owned, banks)).toEqual([
      { bankId: 'b1', name: 'Itaú', cents: 105000 },
      { bankId: 'b2', name: 'Caju', cents: 20000 },
    ])
    expect(bankBalancesOn(results, '2026-12-10', owned, banks)).toEqual([
      { bankId: 'b2', name: 'Caju', cents: 20000 },
      { bankId: 'b1', name: 'Itaú', cents: -295000 },
    ])
    expect(bankBalancesOn(results, '2026-12-09', [{ id: 'va', bankId: 'gone' }], [])).toEqual([
      { bankId: 'gone', name: 'Banco', cents: 20000 },
    ])
    expect(bankBalancesOn(results, '2027-01-09', owned, banks)).toEqual([])
    // Ties go by name.
    expect(
      bankBalancesOn(
        results,
        '2026-12-09',
        [
          { id: 'va', bankId: 'b1' },
          { id: 'va', bankId: 'b2' },
        ],
        banks,
      ).map((b) => b.name),
    ).toEqual(['Caju', 'Itaú'])
  })
})

describe('withConnectedBanks', () => {
  const banks = [
    { bankId: 'b1', name: 'Itaú', cents: 5000 },
    { bankId: 'b2', name: 'BTG', cents: -100 },
  ]

  it('adds a connected institution without a linked account at zero, in balance order', () => {
    expect(withConnectedBanks(banks, ['Nubank Empresas'])).toEqual([
      { bankId: 'b1', name: 'Itaú', cents: 5000 },
      { bankId: 'connection:Nubank Empresas', name: 'Nubank Empresas', cents: 0 },
      { bankId: 'b2', name: 'BTG', cents: -100 },
    ])
  })

  it('orders banks with the same balance by name', () => {
    expect(withConnectedBanks([], ['Nubank', 'Inter']).map((b) => b.name)).toEqual([
      'Inter',
      'Nubank',
    ])
  })

  it('dedupes by name (case and accents) and ignores blanks', () => {
    expect(withConnectedBanks(banks, ['itau', ' ', 'BTG', 'Inter', 'inter'])).toEqual([
      banks[0],
      { bankId: 'connection:Inter', name: 'Inter', cents: 0 },
      banks[1],
    ])
  })
})
