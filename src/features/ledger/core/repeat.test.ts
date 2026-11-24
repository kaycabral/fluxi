import { describe, expect, it } from 'vitest'
import { makeEntry } from './fixtures'
import { lastWeekdayDay, nthWeekdayDay } from './month'
import { landingsIn, occursIn, ruleDay } from './occurrence'
import {
  describeRepeat,
  endMonthAfter,
  endMonthUntil,
  occurrenceCount,
  presetOf,
  repeatPresets,
  weekdayAnchor,
  type RepeatRule,
} from './repeat'
import { applyScopedEdit } from './scoped-edit'

const monthly = (monthBy: RepeatRule['monthBy'] = 'day', repeatEvery = 1): RepeatRule => ({
  recurrence: 'monthly',
  repeatEvery,
  monthBy,
})

describe('weekday helpers', () => {
  it('finds the nth and last weekday of a month', () => {
    // November 2026: Thursdays are 5, 12, 19, 26.
    expect(nthWeekdayDay('2026-11', 4, 4)).toBe(26)
    expect(nthWeekdayDay('2026-11', 4, 1)).toBe(5)
    expect(lastWeekdayDay('2026-11', 4)).toBe(26)
    // A 5th that does not exist falls back to the last one.
    expect(nthWeekdayDay('2027-02', 1, 5)).toBe(22)
  })

  it('anchors a date: its nth weekday (up to 4) and whether it is the last', () => {
    expect(weekdayAnchor('2026-11-26')).toEqual({ weekday: 4, nth: 4, last: true })
    expect(weekdayAnchor('2026-11-30')).toEqual({ weekday: 1, nth: null, last: true })
    expect(weekdayAnchor('2026-11-03')).toEqual({ weekday: 2, nth: 1, last: false })
  })
})

describe('repeatPresets', () => {
  it("offers Google Calendar's options for the date", () => {
    expect(repeatPresets('2026-11-26').map((p) => p.label)).toEqual([
      'Não se repete',
      'Mensal no dia 26',
      'Mensal na quarta quinta-feira',
      'Mensal na última quinta-feira',
      'Anual em 26 de novembro',
    ])
    expect(repeatPresets('2026-11-01').map((p) => p.label)).toEqual([
      'Não se repete',
      'Mensal no dia 1',
      'Mensal no primeiro domingo',
      'Anual em 1 de novembro',
    ])
    expect(repeatPresets('2026-11-28').map((p) => p.label)).toContain('Mensal no último sábado')
  })

  it('tells a preset from a custom rule', () => {
    expect(presetOf('2026-11-26', monthly('weekday'))?.id).toBe('monthly-weekday')
    expect(presetOf('2026-11-26', monthly('day', 2))).toBeNull()
  })
})

describe('describeRepeat', () => {
  const series = (patch: Partial<Parameters<typeof describeRepeat>[0]>) => ({
    recurrence: 'monthly' as const,
    repeatEvery: 1,
    monthBy: 'day' as const,
    startMonth: '2026-11',
    day: 26,
    installments: null,
    endMonth: null,
    ...patch,
  })

  it('describes every kind of series in pt-BR', () => {
    expect(describeRepeat(series({ recurrence: 'none' }))).toBe('Não se repete')
    expect(describeRepeat(series({ recurrence: 'installments', installments: 10 }))).toBe(
      'Parcelado em 10×',
    )
    expect(describeRepeat(series({}))).toBe('Mensal no dia 26')
    expect(describeRepeat(series({ repeatEvery: 2, monthBy: 'weekday' }))).toBe(
      'A cada 2 meses na quarta quinta-feira',
    )
    expect(describeRepeat(series({ monthBy: 'last_weekday' }))).toBe(
      'Mensal na última quinta-feira',
    )
    expect(describeRepeat(series({ recurrence: 'yearly', endMonth: '2030-11' }))).toBe(
      'Anual em 26 de novembro, até nov. de 2030',
    )
    expect(describeRepeat(series({ recurrence: 'yearly', repeatEvery: 3 }))).toBe(
      'A cada 3 anos em 26 de novembro',
    )
    // A 5th weekday start (day 30) only has the "last" form; the plain weekday form says the 4th.
    expect(describeRepeat(series({ day: 30, monthBy: 'weekday' }))).toBe(
      'Mensal na quarta segunda-feira',
    )
  })
})

describe('ends', () => {
  it('"Após N ocorrências" is the month of the Nth one', () => {
    expect(endMonthAfter('2026-11', monthly('day', 2), 3)).toBe('2027-03')
    expect(
      endMonthAfter('2026-11', { recurrence: 'yearly', repeatEvery: 1, monthBy: 'day' }, 2),
    ).toBe('2027-11')
    expect(occurrenceCount('2026-11', monthly('day', 2), '2027-03')).toBe(3)
  })

  it('"Termina em <data>" keeps the occurrences on or before the date', () => {
    const day26 = () => 26
    expect(endMonthUntil('2026-11', monthly(), day26, '2027-02-26')).toBe('2027-02')
    expect(endMonthUntil('2026-11', monthly(), day26, '2027-02-25')).toBe('2027-01')
    expect(endMonthUntil('2026-11', monthly('day', 2), day26, '2027-02-27')).toBe('2027-01')
    expect(endMonthUntil('2026-11', monthly(), day26, '2026-11-01')).toBeNull()
    expect(endMonthUntil('2026-11', monthly(), day26, '2026-10-01')).toBeNull()
  })
})

describe('occurrences of the new rules', () => {
  it('repeats every N months or years', () => {
    const every2 = makeEntry({ startMonth: '2026-11', repeatEvery: 2 })
    expect(['2026-11', '2026-12', '2027-01'].map((m) => occursIn(every2, m))).toEqual([
      true,
      false,
      true,
    ])
    const every2y = makeEntry({ recurrence: 'yearly', startMonth: '2026-11', repeatEvery: 2 })
    expect(occursIn(every2y, '2027-11')).toBe(false)
    expect(occursIn(every2y, '2028-11')).toBe(true)
  })

  it('lands on the nth or last weekday of each month', () => {
    const fourthThursday = makeEntry({ startMonth: '2026-11', day: 26, monthBy: 'weekday' })
    expect(ruleDay(fourthThursday, '2026-12')).toBe(24)
    expect(landingsIn(fourthThursday, [], [], '2027-01')[0]?.day).toBe(28)
    const lastFriday = makeEntry({ startMonth: '2026-11', day: 27, monthBy: 'last_weekday' })
    expect(ruleDay(lastFriday, '2027-01')).toBe(29)
  })

  it('pins the series to a day number when its day is edited for all', () => {
    const entry = makeEntry({ id: 'e1', startMonth: '2026-11', day: 26, monthBy: 'weekday' })
    const result = applyScopedEdit(
      { entry, parts: [], overrides: [] },
      { month: '2026-12', patch: { day: 10 }, scope: 'all' },
      () => 'e2',
    )
    expect(result.entries[0]).toMatchObject({ day: 10, monthBy: 'day' })
  })
})

describe('repeat edge cases', () => {
  it('describes installments without a count and series that start on a short month end', () => {
    expect(
      describeRepeat({
        recurrence: 'installments',
        repeatEvery: 1,
        monthBy: 'day',
        startMonth: '2027-02',
        day: 31,
        installments: null,
        endMonth: null,
      }),
    ).toBe('Parcelado em 0×')
    expect(
      describeRepeat({
        recurrence: 'monthly',
        repeatEvery: 1,
        monthBy: 'day',
        startMonth: '2027-02',
        day: 31,
        installments: null,
        endMonth: null,
      }),
    ).toBe('Mensal no dia 28')
  })

  it('counts at least one occurrence', () => {
    expect(endMonthAfter('2026-11', monthly(), 0)).toBe('2026-11')
  })
})
