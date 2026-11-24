import { describe, expect, it } from 'vitest'
import { calendarMonth, firstWeekday } from './calendar'
import { makeEntry } from './fixtures'
import { projectMonths } from './projection'
import { initialSelectedMonth, sumBalances, timelineWindow } from './timeline'

const entries = [
  makeEntry({ id: 'rent', amountCents: 50000, day: 3, accountId: 'cc', startMonth: '2026-12' }),
  makeEntry({ id: 'gym', amountCents: 10000, day: 3, accountId: 'nu', startMonth: '2026-12' }),
]

function project(countFrom: string) {
  return projectMonths({
    entries,
    parts: [],
    overrides: [],
    accounts: [
      { id: 'cc', type: 'checking', openingBalanceCents: 30000 },
      { id: 'nu', type: 'checking', openingBalanceCents: 20000 },
    ],
    months: ['2026-11', '2026-12'],
    countFrom,
  })
}

describe('calendarMonth', () => {
  it('knows the weekday of the 1st', () => {
    expect(firstWeekday('2026-12')).toBe(2)
    expect(firstWeekday('2026-11')).toBe(0)
    // Malformed months fall back instead of throwing.
    expect(firstWeekday('')).toBe(new Date(Date.UTC(0, 0, 1)).getUTCDay())
  })

  it('counts an account without an opening balance as zero', () => {
    const [, dec] = project('2026-11')
    if (dec === undefined) throw new Error('no month')
    const ghost = calendarMonth(dec, ['ghost'])
    expect(ghost.days[0]?.endBalanceCents).toBe(0)
  })

  it('runs the end-of-day balance of the chosen accounts', () => {
    const [, dec] = project('2026-11')
    if (dec === undefined) throw new Error('no month')
    const all = calendarMonth(dec, null)
    expect(all.leadingBlanks).toBe(2)
    expect(all.days).toHaveLength(31)
    expect(all.days[1]?.endBalanceCents).toBe(50000)
    expect(all.days[2]?.landings).toHaveLength(2)
    expect(all.days[2]?.endBalanceCents).toBe(-10000)
    const nubank = calendarMonth(dec, ['nu'])
    expect(nubank.days[2]?.landings).toHaveLength(1)
    expect(nubank.days[30]?.endBalanceCents).toBe(10000)
  })

  it('runs only the accounts it is given (benefits stay out of the available set)', () => {
    const [dec] = projectMonths({
      entries: [
        ...entries,
        makeEntry({
          id: 'meal',
          amountCents: 4000,
          day: 3,
          accountId: 'va',
          startMonth: '2026-12',
        }),
      ],
      parts: [],
      overrides: [],
      accounts: [
        { id: 'cc', type: 'checking', openingBalanceCents: 30000 },
        { id: 'nu', type: 'checking', openingBalanceCents: 20000 },
        { id: 'va', type: 'benefit', openingBalanceCents: 9000 },
      ],
      months: ['2026-12'],
      countFrom: null,
    })
    if (dec === undefined) throw new Error('no month')
    const available = calendarMonth(dec, ['cc', 'nu'])
    expect(available.days[2]?.landings.map((l) => l.entry.id)).toEqual(['rent', 'gym'])
    expect(available.days[2]?.endBalanceCents).toBe(-10000)
    expect(calendarMonth(dec, ['va']).days[2]?.endBalanceCents).toBe(5000)
  })

  it('has no balances before the count start', () => {
    const [nov] = project('2026-12')
    if (nov === undefined) throw new Error('no month')
    expect(calendarMonth(nov, null).days[0]?.endBalanceCents).toBeNull()
  })
})

describe('timeline helpers', () => {
  it('computes the window and initial month', () => {
    expect(timelineWindow(null, '2026-11')).toEqual({ from: '2026-08', to: '2028-11' })
    expect(timelineWindow('2026-06', '2026-11')).toEqual({ from: '2026-03', to: '2028-11' })
    expect(timelineWindow('2027-01', '2026-11').from).toBe('2026-08')
    expect(initialSelectedMonth('2027-01', '2026-11')).toBe('2027-01')
    expect(initialSelectedMonth(null, '2026-11')).toBe('2026-11')
  })

  it('sums balances', () => {
    expect(sumBalances(null, ['a'])).toBeNull()
    expect(sumBalances({ a: 1, b: 2 }, ['a', 'b', 'c'])).toBe(3)
  })
})
