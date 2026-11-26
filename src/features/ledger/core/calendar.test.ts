import { describe, expect, it } from 'vitest'
import { calendarMonth, firstWeekday, isMovable, withMoves } from './calendar'
import { makeEntry, makePart } from './fixtures'
import { projectMonths } from './projection'
import { sumBalances, timelineWindow } from './timeline'

const entries = [
  makeEntry({ id: 'rent', amountCents: -50000, day: 3, accountId: 'cc', startMonth: '2026-12' }),
  makeEntry({ id: 'gym', amountCents: -10000, day: 3, accountId: 'nu', startMonth: '2026-12' }),
]

function project() {
  return projectMonths({
    entries,
    parts: [],
    overrides: [],
    accounts: [
      { id: 'cc', openingBalanceCents: 30000 },
      { id: 'nu', openingBalanceCents: 20000 },
    ],
    months: ['2026-11', '2026-12'],
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
    const [, dec] = project()
    if (dec === undefined) throw new Error('no month')
    const ghost = calendarMonth(dec, ['ghost'])
    expect(ghost.days[0]?.endBalanceCents).toBe(0)
  })

  it('runs the end-of-day balance of the chosen accounts', () => {
    const [, dec] = project()
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

  it('shows dragged occurrences on their new day before the server confirms', () => {
    const [, dec] = project()
    if (dec === undefined) throw new Error('no month')
    const { days } = calendarMonth(dec, null)
    expect(withMoves(days, [])).toEqual(days)
    const moved = withMoves(days, [
      { entryId: 'rent', competence: '2026-12', day: 20 },
      { entryId: 'rent', competence: '2026-12', day: 10 },
      { entryId: 'gym', competence: '2026-12', day: 3 },
      { entryId: 'rent', competence: '2027-01', day: 1 },
    ])
    expect(moved[2]?.landings.map((l) => l.entry.id)).toEqual(['gym'])
    expect(moved[19]?.landings).toEqual([])
    expect(moved[9]?.landings.map((l) => [l.entry.id, l.day])).toEqual([['rent', 10]])
    expect(moved[0]?.landings).toEqual([])
  })

  it('never drags the parts of a split entry', () => {
    const [, dec] = project()
    const landing = dec?.landings[0]
    if (landing === undefined) throw new Error('no landing')
    expect(isMovable(landing)).toBe(true)
    expect(isMovable({ ...landing, part: makePart() })).toBe(false)
    // The bank owns the date of its entries.
    expect(isMovable({ ...landing, entry: { ...landing.entry, fromBank: true } })).toBe(false)
    const days = [{ day: 3, landings: [{ ...landing, part: makePart() }], endBalanceCents: 0 }]
    const moved = withMoves(days, [{ entryId: landing.entry.id, competence: '2026-12', day: 9 }])
    expect(moved[0]?.landings).toHaveLength(1)
  })

  it('runs only the accounts it is given (benefits stay out of the available set)', () => {
    const [dec] = projectMonths({
      entries: [
        ...entries,
        makeEntry({
          id: 'meal',
          amountCents: -4000,
          day: 3,
          accountId: 'va',
          startMonth: '2026-12',
        }),
      ],
      parts: [],
      overrides: [],
      accounts: [
        { id: 'cc', openingBalanceCents: 30000 },
        { id: 'nu', openingBalanceCents: 20000 },
        { id: 'va', openingBalanceCents: 9000 },
      ],
      months: ['2026-12'],
    })
    if (dec === undefined) throw new Error('no month')
    const available = calendarMonth(dec, ['cc', 'nu'])
    expect(available.days[2]?.landings.map((l) => l.entry.id)).toEqual(['rent', 'gym'])
    expect(available.days[2]?.endBalanceCents).toBe(-10000)
    expect(calendarMonth(dec, ['va']).days[2]?.endBalanceCents).toBe(5000)
  })
})

describe('timeline helpers', () => {
  it('computes the window around today', () => {
    expect(timelineWindow('2026-11')).toEqual({ from: '2026-08', to: '2028-11' })
  })

  it('sums balances', () => {
    expect(sumBalances({ a: 1, b: 2 }, ['a', 'b', 'c'])).toBe(3)
  })
})
