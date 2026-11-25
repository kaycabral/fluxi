import { describe, expect, it } from 'vitest'
import { makeEntry, makeOverride, salarySplit } from './fixtures'
import { monthRange } from './month'
import { dailyBalance, effectOn, projectMonths, type MonthResult } from './projection'

const accounts = [
  { id: 'checking', openingBalanceCents: 100000 },
  { id: 'nubank', openingBalanceCents: 20000 },
] as const

const salary = makeEntry({
  id: 'salary',
  kind: 'income',
  description: 'Salário',
  pot: null,
  amountCents: 500000,
  day: 5,
  startMonth: '2026-11',
})
const rent = makeEntry({ id: 'rent', amountCents: 200000, day: 10, pot: 'essential' })
const gym = makeEntry({
  id: 'gym',
  amountCents: 13000,
  day: 5,
  pot: 'comfort',
  accountId: 'nubank',
})
const misc = makeEntry({ id: 'misc', amountCents: 10000, day: 28, pot: null })
const transfer = makeEntry({
  id: 'transfer',
  kind: 'transfer',
  description: 'Para o Nubank',
  amountCents: 40000,
  day: 6,
  pot: null,
  toAccountId: 'nubank',
})

function project(countFrom: string | null = '2026-12') {
  return projectMonths({
    entries: [rent, gym, misc, transfer, salary],
    parts: [],
    overrides: [],
    accounts,
    months: monthRange('2026-11', '2027-01'),
    countFrom,
  })
}

function monthOf(results: MonthResult[], month: string): MonthResult {
  const found = results.find((r) => r.month === month)
  if (found === undefined) throw new Error(`missing ${month}`)
  return found
}

describe('projectMonths', () => {
  it('totals income, expenses (without transfers), net and pots', () => {
    const december = monthOf(project(), '2026-12')
    expect(december.totals.incomeCents).toBe(500000)
    expect(december.totals.expenseCents).toBe(223000)
    expect(december.totals.netCents).toBe(277000)
    expect(december.totals.byPot).toEqual({ essential: 200000, comfort: 13000 })
    expect(december.totals.unallocatedCents).toBe(10000)
  })

  it('orders landings by day, income first within a day, then input order', () => {
    const december = monthOf(project(), '2026-12')
    expect(december.landings.map((l) => l.entry.id)).toEqual([
      'salary',
      'gym',
      'transfer',
      'rent',
      'misc',
    ])
  })

  it('accumulates balances only from countFrom; earlier months are not counted', () => {
    const [november, december, january] = project()
    expect(november).toMatchObject({
      counted: false,
      openingBalances: null,
      closingBalances: null,
    })
    expect(november?.totals.incomeCents).toBe(500000)
    expect(december?.counted).toBe(true)
    expect(december?.openingBalances).toEqual({ checking: 100000, nubank: 20000 })
    expect(december?.closingBalances).toEqual({
      checking: 100000 + 500000 - 200000 - 10000 - 40000,
      nubank: 20000 + 40000 - 13000,
    })
    expect(january?.openingBalances).toEqual(december?.closingBalances)
    expect(january?.closingBalances).toEqual({ checking: 600000, nubank: 74000 })
  })

  it('counts every month when countFrom is null', () => {
    const results = project(null)
    expect(results.every((r) => r.counted)).toBe(true)
    expect(results[0]?.openingBalances).toEqual({ checking: 100000, nubank: 20000 })
  })

  it('moves transfers between accounts without touching totals', () => {
    const [result] = projectMonths({
      entries: [transfer],
      parts: [],
      overrides: [],
      accounts,
      months: ['2026-12'],
      countFrom: null,
    })
    expect(result?.totals).toMatchObject({
      incomeCents: 0,
      expenseCents: 0,
      netCents: 0,
    })
    expect(result?.closingBalances).toEqual({ checking: 60000, nubank: 60000 })
  })

  it('sorts the months it is given and starts unknown accounts at zero', () => {
    const results = projectMonths({
      entries: [makeEntry({ accountId: 'ghost', amountCents: 500 })],
      parts: [],
      overrides: [],
      accounts: [],
      months: ['2026-10', '2026-09'],
      countFrom: null,
    })
    expect(results.map((r) => r.month)).toEqual(['2026-09', '2026-10'])
    expect(results[1]?.closingBalances).toEqual({ ghost: -1000 })
  })

  it('applies parts and overrides across months', () => {
    const split = makeEntry({
      id: 'split',
      kind: 'income',
      pot: null,
      amountCents: 1000000,
      startMonth: '2026-12',
      endMonth: '2026-12',
    })
    const results = projectMonths({
      entries: [split, rent],
      parts: salarySplit('split'),
      overrides: [makeOverride({ entryId: 'rent', month: '2027-01', skipped: true })],
      accounts,
      months: monthRange('2026-12', '2027-01'),
      countFrom: '2026-12',
    })
    expect(results.map((r) => [r.totals.incomeCents, r.totals.expenseCents])).toEqual([
      [400000, 200000],
      [600000, 0],
    ])
    expect(results[1]?.closingBalances?.checking).toBe(100000 + 1000000 - 200000)
  })
})

describe('projectMonths with benefit accounts', () => {
  const benefitAccounts = [
    { id: 'checking', openingBalanceCents: 100000 },
    { id: 'va', openingBalanceCents: 5000 },
  ] as const
  const voucher = makeEntry({
    id: 'voucher',
    kind: 'income',
    pot: null,
    amountCents: 80000,
    day: 1,
    accountId: 'va',
  })
  const groceries = makeEntry({
    id: 'groceries',
    amountCents: 30000,
    day: 8,
    pot: 'essential',
    accountId: 'va',
  })
  const topUp = makeEntry({
    id: 'top-up',
    kind: 'transfer',
    amountCents: 10000,
    day: 9,
    pot: null,
    accountId: 'checking',
    toAccountId: 'va',
  })

  function projectBuckets(entries = [salary, rent, voucher, groceries]) {
    const [result] = projectMonths({
      entries,
      parts: [],
      overrides: [],
      accounts: benefitAccounts,
      months: ['2026-12'],
      countFrom: null,
    })
    if (result === undefined) throw new Error('no month')
    return result
  }

  it('counts benefit income and expenses like any other account', () => {
    const { totals, closingBalances } = projectBuckets()
    expect(totals).toMatchObject({
      incomeCents: 580000,
      expenseCents: 230000,
      netCents: 350000,
    })
    expect(totals.byPot.essential).toBe(230000)
    expect(closingBalances).toEqual({ checking: 400000, va: 55000 })
  })

  it('never counts a transfer as income or expense', () => {
    const { totals } = projectBuckets([topUp])
    expect(totals).toMatchObject({ incomeCents: 0, expenseCents: 0, unallocatedCents: 0 })
  })
})

describe('effectOn', () => {
  it('is signed per account and zero for unrelated accounts', () => {
    const december = monthOf(project(), '2026-12')
    const byId = (id: string) => {
      const landing = december.landings.find((l) => l.entry.id === id)
      if (landing === undefined) throw new Error(id)
      return landing
    }
    expect(effectOn(byId('salary'), 'checking')).toBe(500000)
    expect(effectOn(byId('rent'), 'checking')).toBe(-200000)
    expect(effectOn(byId('rent'), 'nubank')).toBe(0)
    expect(effectOn(byId('transfer'), 'checking')).toBe(-40000)
    expect(effectOn(byId('transfer'), 'nubank')).toBe(40000)
    expect(effectOn(byId('transfer'), 'other')).toBe(0)
  })
})

describe('dailyBalance', () => {
  it('runs the balance of all accounts with its minimum and day', () => {
    const december = monthOf(project(), '2026-12')
    const daily = dailyBalance(december, null)
    expect(daily).toMatchObject({ openingCents: 120000, closingCents: 397000 })
    expect(
      daily?.rows.map((r) => [r.landing.entry.id, r.effectCents, r.balanceAfterCents]),
    ).toEqual([
      ['salary', 500000, 620000],
      ['gym', -13000, 607000],
      ['transfer', 0, 607000],
      ['rent', -200000, 407000],
      ['misc', -10000, 397000],
    ])
    expect(daily).toMatchObject({ minBalanceCents: 120000, minDay: 1 })
  })

  it('filters to the given accounts and finds the lowest point', () => {
    const results = projectMonths({
      entries: [rent, transfer, gym, salary],
      parts: [],
      overrides: [makeOverride({ entryId: 'salary', month: '2026-12', day: 20 })],
      accounts,
      months: ['2026-12'],
      countFrom: null,
    })
    const daily = dailyBalance(monthOf(results, '2026-12'), ['checking'])
    expect(daily?.rows.map((r) => r.landing.entry.id)).toEqual(['transfer', 'rent', 'salary'])
    expect(daily).toMatchObject({
      openingCents: 100000,
      minBalanceCents: -140000,
      minDay: 10,
      closingCents: 360000,
    })
    const nubank = dailyBalance(monthOf(results, '2026-12'), ['nubank'])
    expect(nubank?.rows.map((r) => r.effectCents)).toEqual([-13000, 40000])
  })

  it('is null for a month before countFrom', () => {
    expect(dailyBalance(monthOf(project(), '2026-11'), null)).toBeNull()
  })
})
