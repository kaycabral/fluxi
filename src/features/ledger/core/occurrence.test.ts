import { describe, expect, it } from 'vitest'
import { makeEntry, makeOverride, makePart, salarySplit } from './fixtures'
import {
  amountFor,
  dayFor,
  installmentShares,
  landingsIn,
  occursIn,
  splitAmount,
} from './occurrence'

describe('occursIn', () => {
  it('none: only the start month', () => {
    const entry = makeEntry({ recurrence: 'none', startMonth: '2026-12' })
    expect(occursIn(entry, '2026-11')).toBe(false)
    expect(occursIn(entry, '2026-12')).toBe(true)
    expect(occursIn(entry, '2027-01')).toBe(false)
  })

  it('monthly: every month from the start, open-ended', () => {
    const entry = makeEntry({ startMonth: '2026-09' })
    expect(occursIn(entry, '2026-08')).toBe(false)
    expect(occursIn(entry, '2026-09')).toBe(true)
    expect(occursIn(entry, '2030-01')).toBe(true)
  })

  it('monthly: stops after end_month (inclusive)', () => {
    const entry = makeEntry({ startMonth: '2026-09', endMonth: '2026-11' })
    expect(occursIn(entry, '2026-11')).toBe(true)
    expect(occursIn(entry, '2026-12')).toBe(false)
  })

  it('yearly: every 12 months, bounded by end_month', () => {
    const entry = makeEntry({ recurrence: 'yearly', startMonth: '2026-12', endMonth: '2028-12' })
    expect(occursIn(entry, '2026-12')).toBe(true)
    expect(occursIn(entry, '2027-06')).toBe(false)
    expect(occursIn(entry, '2027-12')).toBe(true)
    expect(occursIn(entry, '2028-12')).toBe(true)
    expect(occursIn(entry, '2029-12')).toBe(false)
  })

  it('installments: exactly N consecutive months', () => {
    const entry = makeEntry({
      recurrence: 'installments',
      installments: 12,
      startMonth: '2027-02',
    })
    expect(occursIn(entry, '2027-01')).toBe(false)
    expect(occursIn(entry, '2027-02')).toBe(true)
    expect(occursIn(entry, '2028-01')).toBe(true)
    expect(occursIn(entry, '2028-02')).toBe(false)
  })

  it('installments without a count never occur', () => {
    expect(occursIn(makeEntry({ recurrence: 'installments' }), '2026-09')).toBe(false)
  })
})

describe('installments split the total', () => {
  it('evenly, with the leftover cents on the first installment', () => {
    expect(installmentShares(600000, 3)).toEqual({ first: 200000, rest: 200000 })
    expect(installmentShares(100000, 3)).toEqual({ first: 33334, rest: 33333 })
  })

  it('amountFor gives each installment its share (an override still wins)', () => {
    const ring = makeEntry({
      recurrence: 'installments',
      installments: 3,
      startMonth: '2026-11',
      amountCents: 100000,
    })
    const overrides = [makeOverride({ month: '2027-01', amountCents: 50000 })]
    expect(amountFor(ring, overrides, '2026-11')).toBe(33334)
    expect(amountFor(ring, overrides, '2026-12')).toBe(33333)
    expect(amountFor(ring, overrides, '2027-01')).toBe(50000)
    expect(landingsIn(ring, [], [], '2026-12').map((l) => l.amountCents)).toEqual([33333])
  })
})

describe('amountFor / dayFor', () => {
  const entry = makeEntry()
  const overrides = [
    makeOverride({ month: '2026-10', amountCents: 31000 }),
    makeOverride({ month: '2026-11', day: 3 }),
    makeOverride({ entryId: 'other', month: '2026-12', amountCents: 1 }),
  ]

  it('use the entry by default and the override when set', () => {
    expect(amountFor(entry, overrides, '2026-09')).toBe(26000)
    expect(amountFor(entry, overrides, '2026-10')).toBe(31000)
    expect(amountFor(entry, overrides, '2026-11')).toBe(26000)
    expect(dayFor(entry, overrides, '2026-10')).toBe(15)
    expect(dayFor(entry, overrides, '2026-11')).toBe(3)
  })

  it("ignore other entries' overrides", () => {
    expect(amountFor(entry, overrides, '2026-12')).toBe(26000)
  })
})

describe('splitAmount', () => {
  it('gives the rounding remainder to the last part so shares sum to the amount', () => {
    const parts = [makePart({ bps: 3333 }), makePart({ bps: 3333 }), makePart({ bps: 3334 })]
    const shares = splitAmount(100, parts)
    expect(shares).toEqual([33, 33, 34])
    expect(splitAmount(1001, salarySplit('e1'))).toEqual([400, 601])
    expect(splitAmount(99999, parts).reduce((a, b) => a + b, 0)).toBe(99999)
  })

  it('floors every share when the parts do not total 100%', () => {
    expect(splitAmount(1001, [makePart({ bps: 5000 }), makePart({ bps: 2500 })])).toEqual([
      500, 250,
    ])
  })

  it('returns nothing for no parts', () => {
    expect(splitAmount(1000, [])).toEqual([])
  })
})

describe('landingsIn', () => {
  it('lands a plain occurrence with the override applied', () => {
    const entry = makeEntry()
    const overrides = [makeOverride({ month: '2026-10', amountCents: 30000, day: 2 })]
    expect(landingsIn(entry, [], overrides, '2026-10')).toEqual([
      { entry, month: '2026-10', competence: '2026-10', day: 2, amountCents: 30000, part: null },
    ])
    expect(landingsIn(entry, [], overrides, '2026-08')).toEqual([])
  })

  it('clamps the day to the month length (February)', () => {
    const entry = makeEntry({ day: 31 })
    expect(landingsIn(entry, [], [], '2027-02')[0]?.day).toBe(28)
    expect(landingsIn(entry, [], [], '2028-02')[0]?.day).toBe(29)
    expect(landingsIn(entry, [], [], '2027-03')[0]?.day).toBe(31)
  })

  it('skips an occurrence marked skipped', () => {
    const entry = makeEntry()
    const overrides = [makeOverride({ month: '2026-10', skipped: true })]
    expect(landingsIn(entry, [], overrides, '2026-10')).toEqual([])
    expect(landingsIn(entry, [], overrides, '2026-11')).toHaveLength(1)
  })

  it('splits parts, carrying a next-month part into the following month', () => {
    const entry = makeEntry({
      kind: 'income',
      pot: null,
      amountCents: 1140000,
      startMonth: '2026-12',
      endMonth: '2027-04',
    })
    const parts = salarySplit('e1')

    const december = landingsIn(entry, parts, [], '2026-12')
    expect(december).toEqual([
      expect.objectContaining({ competence: '2026-12', day: 20, amountCents: 456000 }),
    ])

    const january = landingsIn(entry, parts, [], '2027-01')
    expect(january.map((l) => [l.part?.label, l.competence, l.day, l.amountCents])).toEqual([
      ['Adiantamento', '2027-01', 20, 456000],
      ['Saldo', '2026-12', 5, 684000],
    ])

    expect(landingsIn(entry, parts, [], '2027-05')).toEqual([
      expect.objectContaining({ competence: '2027-04', amountCents: 684000 }),
    ])
    expect(landingsIn(entry, parts, [], '2027-06')).toEqual([])
  })

  it('orders parts by sort and ignores parts of other entries', () => {
    const entry = makeEntry({ amountCents: 1000 })
    const parts = [
      makePart({ id: 'b', bps: 7000, day: 25, sort: 1 }),
      makePart({ id: 'a', bps: 3000, day: 10, sort: 0 }),
      makePart({ id: 'x', entryId: 'other', bps: 10000, day: 1 }),
    ]
    expect(landingsIn(entry, parts, [], '2026-09').map((l) => [l.part?.id, l.amountCents])).toEqual(
      [
        ['a', 300],
        ['b', 700],
      ],
    )
  })

  it('uses the competence month override for every part and skips all parts of a skipped occurrence', () => {
    const entry = makeEntry({ kind: 'income', pot: null, amountCents: 1000, startMonth: '2026-12' })
    const parts = salarySplit('e1')
    const overrides = [
      makeOverride({ month: '2026-12', amountCents: 2000 }),
      makeOverride({ month: '2027-01', skipped: true }),
    ]
    expect(landingsIn(entry, parts, overrides, '2027-01')).toEqual([
      expect.objectContaining({ competence: '2026-12', amountCents: 1200 }),
    ])
    expect(landingsIn(entry, parts, overrides, '2027-02')).toEqual([
      expect.objectContaining({ competence: '2027-02', amountCents: 400 }),
    ])
  })

  it('clamps part days too', () => {
    const entry = makeEntry({ amountCents: 1000 })
    const parts = [makePart({ day: 30 })]
    expect(landingsIn(entry, parts, [], '2027-02')[0]?.day).toBe(28)
  })
})
