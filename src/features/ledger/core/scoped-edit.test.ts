import { describe, expect, it } from 'vitest'
import { makeEntry, makeOverride, salarySplit } from './fixtures'
import { landingsIn } from './occurrence'
import {
  applyScopedEdit,
  endSeriesBefore,
  resignAmount,
  resignForKind,
  sameSplit,
  shiftStart,
  type SeriesState,
} from './scoped-edit'

function ids() {
  let n = 0
  return () => `new-${++n}`
}

const monthly = makeEntry({ amountCents: 1000, day: 10, startMonth: '2026-09' })
const overrides = [
  makeOverride({ month: '2026-10', amountCents: 1500 }),
  makeOverride({ month: '2026-12', day: 3 }),
  makeOverride({ month: '2027-01', skipped: true }),
  makeOverride({ entryId: 'other', month: '2026-12', amountCents: 9 }),
]
const state: SeriesState = { entry: monthly, parts: [], overrides }

describe('applyScopedEdit: one', () => {
  it('creates an override for just that month', () => {
    const result = applyScopedEdit(
      state,
      { month: '2026-11', patch: { amountCents: 2000 }, scope: 'one' },
      ids(),
    )
    expect(result.entries).toEqual([monthly])
    expect(result.overrides).toContainEqual(makeOverride({ month: '2026-11', amountCents: 2000 }))
    expect(result.overrides).toHaveLength(4)
  })

  it('merges into an existing override', () => {
    const result = applyScopedEdit(
      state,
      { month: '2026-12', patch: { amountCents: 2000 }, scope: 'one' },
      ids(),
    )
    expect(result.overrides.filter((o) => o.month === '2026-12')).toEqual([
      makeOverride({ month: '2026-12', amountCents: 2000, day: 3 }),
    ])
  })
})

describe('applyScopedEdit: all', () => {
  it('edits the entry and clears the patched field from every override', () => {
    const result = applyScopedEdit(
      state,
      { month: '2026-11', patch: { amountCents: 2000 }, scope: 'all' },
      ids(),
    )
    expect(result.entries).toEqual([{ ...monthly, amountCents: 2000 }])
    expect(result.overrides).toEqual([
      makeOverride({ month: '2026-12', day: 3 }),
      makeOverride({ month: '2027-01', skipped: true }),
    ])
  })

  it('keeps fields that were not patched', () => {
    const result = applyScopedEdit(
      state,
      { month: '2026-11', patch: { day: 20 }, scope: 'all' },
      ids(),
    )
    expect(result.entries[0]).toMatchObject({ amountCents: 1000, day: 20 })
    expect(result.overrides.map((o) => o.month)).toEqual(['2026-10', '2027-01'])
  })
})

describe('shiftStart', () => {
  it('moves the start by the months the occurrence moved, keeping the end', () => {
    const sub = makeEntry({ startMonth: '2027-01', endMonth: '2030-12' })
    expect(shiftStart(sub, '2027-01', '2026-12')).toMatchObject({
      startMonth: '2026-12',
      endMonth: '2030-12',
    })
    expect(shiftStart(sub, '2027-03', '2027-05').startMonth).toBe('2027-03')
    expect(shiftStart(sub, '2027-03', '2027-03')).toEqual(sub)
  })
})

describe('applyScopedEdit: future', () => {
  it('edits the entry itself when the month is the series start', () => {
    const result = applyScopedEdit(
      state,
      { month: '2026-09', patch: { amountCents: 2000 }, scope: 'future' },
      ids(),
    )
    expect(result.entries).toEqual([{ ...monthly, amountCents: 2000 }])
    expect(result.overrides).toHaveLength(3)
  })

  it('splits a monthly series: old ends the month before, new starts with the patch', () => {
    const bounded = { ...monthly, endMonth: '2027-06' }
    const result = applyScopedEdit(
      { entry: bounded, parts: [], overrides },
      { month: '2026-12', patch: { amountCents: 2000 }, scope: 'future' },
      ids(),
    )
    expect(result.entries).toEqual([
      { ...bounded, endMonth: '2026-11' },
      { ...bounded, id: 'new-1', startMonth: '2026-12', amountCents: 2000 },
    ])
    expect(result.overrides).toEqual([
      makeOverride({ month: '2026-10', amountCents: 1500 }),
      makeOverride({ entryId: 'new-1', month: '2026-12', day: 3 }),
      makeOverride({ entryId: 'new-1', month: '2027-01', skipped: true }),
    ])
  })

  it('splits the installment count', () => {
    const buffet = makeEntry({
      recurrence: 'installments',
      installments: 12,
      startMonth: '2027-02',
      amountCents: 3000000,
    })
    const result = applyScopedEdit(
      { entry: buffet, parts: [], overrides: [] },
      { month: '2027-06', patch: { amountCents: 300000 }, scope: 'future' },
      ids(),
    )
    expect(
      result.entries.map((e) => [e.startMonth, e.installments, e.amountCents, e.endMonth]),
    ).toEqual([
      ['2027-02', 4, 1000000, null],
      ['2027-06', 8, 2400000, null],
    ])
  })

  it('keeps the leftover cents on the installments already due', () => {
    const ring = makeEntry({
      recurrence: 'installments',
      installments: 3,
      startMonth: '2026-11',
      amountCents: 100000,
    })
    const state = { entry: ring, parts: [], overrides: [] }
    const split = applyScopedEdit(
      state,
      { month: '2026-12', patch: { day: 5 }, scope: 'future' },
      ids(),
    )
    expect(split.entries.map((e) => [e.installments, e.amountCents])).toEqual([
      [1, 33334],
      [2, 66666],
    ])
    const all = applyScopedEdit(
      state,
      { month: '2026-12', patch: { amountCents: 40000 }, scope: 'all' },
      ids(),
    )
    expect(all.entries[0]?.amountCents).toBe(120000)
    expect(endSeriesBefore(ring, '2027-01')).toMatchObject({ installments: 2, amountCents: 66667 })
  })

  it('splits a negative installment total exactly like its magnitude', () => {
    const ring = makeEntry({
      recurrence: 'installments',
      installments: 3,
      startMonth: '2026-11',
      amountCents: -100000,
    })
    const split = applyScopedEdit(
      { entry: ring, parts: [], overrides: [] },
      { month: '2026-12', patch: { day: 5 }, scope: 'future' },
      ids(),
    )
    expect(split.entries.map((e) => [e.installments, e.amountCents])).toEqual([
      [1, -33334],
      [2, -66666],
    ])
    expect(endSeriesBefore(ring, '2027-01')).toMatchObject({ installments: 2, amountCents: -66667 })
  })

  it('splits a yearly series and copies parts to the new entry', () => {
    const yearly = makeEntry({ recurrence: 'yearly', startMonth: '2026-12', amountCents: 780000 })
    const parts = [...salarySplit('e1'), ...salarySplit('other')]
    const result = applyScopedEdit(
      { entry: yearly, parts, overrides: [] },
      { month: '2028-12', patch: { day: 18 }, scope: 'future' },
      ids(),
    )
    expect(result.entries.map((e) => [e.id, e.startMonth, e.endMonth, e.day])).toEqual([
      ['e1', '2026-12', '2028-11', 15],
      ['new-1', '2028-12', null, 18],
    ])
    expect(result.parts.map((p) => [p.id, p.entryId, p.label])).toEqual([
      ['e1-a', 'e1', 'Adiantamento'],
      ['e1-b', 'e1', 'Saldo'],
      ['new-2', 'new-1', 'Adiantamento'],
      ['new-3', 'new-1', 'Saldo'],
    ])
  })

  it('keeps the next-month part of the last old occurrence after a split', () => {
    const salary = makeEntry({
      kind: 'income',
      pot: null,
      amountCents: 1000,
      startMonth: '2026-12',
    })
    const result = applyScopedEdit(
      { entry: salary, parts: salarySplit('e1'), overrides: [] },
      { month: '2027-03', patch: { amountCents: 2000 }, scope: 'future' },
      ids(),
    )
    const [before, after] = result.entries
    if (before === undefined || after === undefined) throw new Error('expected a split')
    const march = [
      ...landingsIn(before, result.parts, result.overrides, '2027-03'),
      ...landingsIn(after, result.parts, result.overrides, '2027-03'),
    ]
    expect(march.map((l) => [l.entry.id, l.competence, l.amountCents])).toEqual([
      ['e1', '2027-02', 600],
      ['new-1', '2027-03', 800],
    ])
  })
})

describe('applyScopedEdit: guards', () => {
  it('rejects a month that is not an occurrence', () => {
    expect(() =>
      applyScopedEdit(state, { month: '2026-08', patch: { day: 1 }, scope: 'one' }, ids()),
    ).toThrow(RangeError)
    const yearly = makeEntry({ recurrence: 'yearly', startMonth: '2026-12' })
    expect(() =>
      applyScopedEdit(
        { entry: yearly, parts: [], overrides: [] },
        { month: '2027-06', patch: { day: 1 }, scope: 'future' },
        ids(),
      ),
    ).toThrow('no occurrence')
  })
})

describe('applyScopedEdit: new split', () => {
  const salary = makeEntry({
    kind: 'income',
    pot: null,
    amountCents: 1000,
    day: 30,
    startMonth: '2026-01',
  })
  const split = salarySplit('e1').map((p) => ({ ...p, nextMonth: false }))

  it('splits only from the edited month on with `future` (earlier months stay whole)', () => {
    const result = applyScopedEdit(
      { entry: salary, parts: [], overrides: [] },
      { month: '2026-12', patch: { amountCents: 2000, parts: split }, scope: 'future' },
      ids(),
    )
    const [before, after] = result.entries
    if (before === undefined || after === undefined) throw new Error('expected a split')
    expect([before.endMonth, after.startMonth, after.amountCents, after.day]).toEqual([
      '2026-11',
      '2026-12',
      2000,
      20,
    ])
    expect(result.parts.map((p) => [p.entryId, p.label, p.bps])).toEqual([
      ['new-1', 'Adiantamento', 4000],
      ['new-1', 'Saldo', 6000],
    ])
    const landings = (month: string) =>
      result.entries.flatMap((e) =>
        landingsIn(e, result.parts, result.overrides, month).map((l) => [l.day, l.amountCents]),
      )
    expect(landings('2026-11')).toEqual([[30, 1000]])
    expect(landings('2026-12')).toEqual([
      [20, 800],
      [5, 1200],
    ])
  })

  it('keeps the old split on the old series when `future` changes it', () => {
    const result = applyScopedEdit(
      { entry: salary, parts: salarySplit('e1'), overrides: [] },
      { month: '2026-06', patch: { parts: [] }, scope: 'future' },
      ids(),
    )
    expect(result.parts.map((p) => p.entryId)).toEqual(['e1', 'e1'])
  })

  it('replaces the split of the whole series with `all`', () => {
    const result = applyScopedEdit(
      { entry: salary, parts: [], overrides: [] },
      { month: '2026-06', patch: { parts: split }, scope: 'all' },
      ids(),
    )
    expect(result.entries.map((e) => [e.id, e.day])).toEqual([['e1', 20]])
    expect(result.parts.map((p) => [p.id, p.entryId])).toEqual([
      ['e1-a', 'e1'],
      ['e1-b', 'e1'],
    ])
  })

  it('compares a drafted split with the entry parts, in order', () => {
    const current = salarySplit('e1')
    const drafted = current.map(({ label, bps, day, nextMonth }) => ({
      label,
      bps,
      day,
      nextMonth,
    }))
    expect(sameSplit(drafted, [...current].reverse())).toBe(true)
    expect(sameSplit([...drafted].reverse(), current)).toBe(false)
    expect(sameSplit(drafted.slice(1), current)).toBe(false)
    expect(sameSplit([], [])).toBe(true)
  })

  it('refuses a new split on one occurrence', () => {
    expect(() =>
      applyScopedEdit(
        { entry: salary, parts: [], overrides: [] },
        { month: '2026-06', patch: { parts: split }, scope: 'one' },
        ids(),
      ),
    ).toThrow(RangeError)
  })
})

describe('resignForKind', () => {
  const refund = makeEntry({ amountCents: 5000 })
  const state: SeriesState = {
    entry: refund,
    parts: [],
    overrides: [
      makeOverride({ month: '2026-10', amountCents: 7000 }),
      makeOverride({ month: '2026-11' }),
    ],
  }

  it('flips amounts only when the natural direction flips, and makes transfers negative', () => {
    expect(resignAmount('expense', 'income', -100)).toBe(100)
    expect(resignAmount('income', 'expense', 100)).toBe(-100)
    expect(resignAmount('expense', 'expense', 100)).toBe(100)
    expect(resignAmount('income', 'transfer', 100)).toBe(-100)
    expect(resignAmount('transfer', 'expense', -100)).toBe(-100)
  })

  it('re-signs the entry and its override amounts, or keeps the same state', () => {
    expect(resignForKind(state, 'expense')).toBe(state)
    const income = resignForKind(state, 'income')
    expect(income.entry.amountCents).toBe(-5000)
    expect(income.overrides.map((o) => o.amountCents)).toEqual([-7000, null])
    const transfer = resignForKind(state, 'transfer')
    expect(transfer.entry.amountCents).toBe(-5000)
    expect(transfer.overrides.map((o) => o.amountCents)).toEqual([-7000, null])
  })
})
