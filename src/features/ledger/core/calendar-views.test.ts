import { describe, expect, it } from 'vitest'
import {
  addDays,
  cellOf,
  columnDays,
  dayCells,
  isWeekend,
  monthDays,
  monthWeeks,
  shiftDate,
  startOfWeek,
  VIEW_SLUGS,
  viewFromSlug,
  viewMonths,
  viewTitle,
  weekdayOf,
  withDateMoves,
} from './calendar-views'
import { makeEntry, makeOverride } from './fixtures'
import { projectMonths } from './projection'

describe('day arithmetic', () => {
  it('adds days across months and years', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01')
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('knows weekdays, weekends and the Sunday of a week', () => {
    expect(weekdayOf('2026-11-24')).toBe(2)
    expect(isWeekend('2026-11-28')).toBe(true)
    expect(isWeekend('2026-11-29')).toBe(true)
    expect(isWeekend('2026-11-30')).toBe(false)
    expect(startOfWeek('2026-11-24')).toBe('2026-11-22')
    expect(startOfWeek('2026-11-22')).toBe('2026-11-22')
  })

  it('lists the days of a month and its full weeks', () => {
    expect(monthDays('2027-02')).toHaveLength(28)
    const weeks = monthWeeks('2026-11')
    expect(weeks).toHaveLength(5)
    expect(weeks[0]?.[0]).toBe('2026-11-01')
    expect(weeks.at(-1)?.at(-1)).toBe('2026-12-05')
    // August 2026 starts on a Saturday and needs 6 rows.
    expect(monthWeeks('2026-08')).toHaveLength(6)
    expect(monthWeeks('2026-08')[0]?.[0]).toBe('2026-07-26')
  })
})

describe('views', () => {
  it('maps the URL slugs both ways', () => {
    expect(viewFromSlug(VIEW_SLUGS.four_days)).toBe('four_days')
    expect(viewFromSlug('semana')).toBe('week')
    expect(viewFromSlug('nada')).toBeNull()
  })

  it('lists the days of the column views', () => {
    expect(columnDays('day', '2026-11-24')).toEqual(['2026-11-24'])
    expect(columnDays('four_days', '2026-11-30')).toEqual([
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
      '2026-12-03',
    ])
    expect(columnDays('week', '2026-11-24')[0]).toBe('2026-11-22')
  })

  it('loads the months each view needs', () => {
    expect(viewMonths('month', '2026-11-24')).toEqual({ from: '2026-10', to: '2026-12' })
    expect(viewMonths('year', '2026-11-24')).toEqual({ from: '2026-01', to: '2026-12' })
    expect(viewMonths('schedule', '2026-11-24')).toEqual({ from: '2026-11', to: '2027-10' })
    expect(viewMonths('week', '2026-12-01')).toEqual({ from: '2026-11', to: '2026-12' })
    expect(viewMonths('day', '2026-12-01')).toEqual({ from: '2026-12', to: '2026-12' })
    expect(viewMonths('four_days', '2026-12-30')).toEqual({ from: '2026-12', to: '2027-01' })
  })

  it('moves a page back and forth', () => {
    expect(shiftDate('day', '2026-11-30', 1)).toBe('2026-12-01')
    expect(shiftDate('four_days', '2026-11-30', -1)).toBe('2026-11-26')
    expect(shiftDate('week', '2026-11-24', 1)).toBe('2026-12-01')
    expect(shiftDate('month', '2026-11-24', 1)).toBe('2026-12-01')
    expect(shiftDate('year', '2026-11-24', -1)).toBe('2025-01-01')
    expect(shiftDate('schedule', '2026-11-24', 1)).toBe('2027-11-01')
  })

  it('titles each view like Google Calendar', () => {
    expect(viewTitle('month', '2026-11-24')).toBe('Novembro de 2026')
    expect(viewTitle('year', '2026-11-24')).toBe('2026')
    expect(viewTitle('day', '2026-11-04')).toBe('4 de novembro de 2026')
    expect(viewTitle('week', '2026-11-10')).toBe('Novembro de 2026')
    expect(viewTitle('week', '2026-12-01')).toBe('Nov. – dez. de 2026')
    expect(viewTitle('four_days', '2026-12-30')).toBe('Dez. de 2026 – jan. de 2027')
    expect(viewTitle('week', '2027-05-30')).toBe('Maio – jun. de 2027')
    expect(viewTitle('schedule', '2026-11-24')).toBe('Nov. de 2026 – out. de 2027')
  })
})

describe('dayCells', () => {
  const rent = makeEntry({ id: 'rent', amountCents: -50000, day: 3, accountId: 'cc' })
  const gym = makeEntry({ id: 'gym', amountCents: -10000, day: 3, accountId: 'nu' })
  const overrides = [makeOverride({ entryId: 'gym', month: '2026-12', skipped: true, day: 8 })]
  const results = projectMonths({
    entries: [rent, gym],
    parts: [],
    overrides,
    accounts: [
      { id: 'cc', openingBalanceCents: 100000 },
      { id: 'nu', openingBalanceCents: 20000 },
    ],
    months: ['2026-12'],
  })
  const source = { entries: [rent, gym], parts: [], overrides }

  it('keys every day by date, with landings, balance and the ignored occurrences', () => {
    const cells = dayCells(results, null, source)
    expect(cells.size).toBe(31)
    expect(cellOf(cells, '2026-12-03').landings.map((l) => l.entry.id)).toEqual(['rent'])
    expect(cellOf(cells, '2026-12-03').endBalanceCents).toBe(70000)
    expect(cellOf(cells, '2026-12-08').skipped.map((l) => l.entry.id)).toEqual(['gym'])
  })

  it('filters by account, ignored occurrences included', () => {
    const cells = dayCells(results, ['cc'], source)
    expect(cellOf(cells, '2026-12-08').skipped).toEqual([])
    expect(cellOf(cells, '2026-12-31').endBalanceCents).toBe(50000)
  })

  it('gives an empty cell for a day that was not loaded', () => {
    expect(cellOf(dayCells(results, null, source), '2027-01-01')).toEqual({
      date: '2027-01-01',
      landings: [],
      skipped: [],
      endBalanceCents: null,
    })
  })
})

describe('withDateMoves', () => {
  const rent = makeEntry({ id: 'rent', amountCents: -50000, day: 3, accountId: 'cc' })
  const results = projectMonths({
    entries: [rent],
    parts: [],
    overrides: [],
    accounts: [{ id: 'cc', openingBalanceCents: 0 }],
    months: ['2026-12'],
  })
  const cells = dayCells(results, null, { entries: [rent], parts: [], overrides: [] })

  it('moves a whole occurrence to its new day until the server confirms', () => {
    const moved = withDateMoves(cells, [
      { entryId: 'rent', competence: '2026-12', date: '2026-12-10' },
    ])
    expect(cellOf(moved, '2026-12-03').landings).toEqual([])
    expect(cellOf(moved, '2026-12-10').landings.map((l) => l.day)).toEqual([10])
  })

  it('keeps the cells without moves, or with a move to the same day', () => {
    expect(withDateMoves(cells, [])).toBe(cells)
    const same = withDateMoves(cells, [
      { entryId: 'rent', competence: '2026-12', date: '2026-12-03' },
    ])
    expect(cellOf(same, '2026-12-03').landings).toHaveLength(1)
    const outside = withDateMoves(cells, [
      { entryId: 'rent', competence: '2026-12', date: '2027-01-02' },
    ])
    expect(cellOf(outside, '2026-12-03').landings).toEqual([])
  })
})
