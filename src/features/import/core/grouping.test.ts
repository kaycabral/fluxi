import { describe, expect, it } from 'vitest'
import { item } from './fixtures'
import { groupIntoEntries, mode, splitLanes } from './grouping'

const months = (list: string[], patch: Parameters<typeof item>[0] = {}) =>
  list.map((month, i) => item({ month, externalIds: [`tx-${month}-${i}`], ...patch }))

describe('mode', () => {
  it('breaks ties by first appearance, like Python Counter.most_common', () => {
    expect(mode([31, 29, 30, 31, 30])).toBe(31)
    expect(mode([30, 31, 31, 30])).toBe(30)
    expect(mode([])).toBeUndefined()
  })
})

describe('groupIntoEntries', () => {
  it('folds consecutive months into one monthly series', () => {
    const { entries } = groupIntoEntries(months(['2026-01', '2026-02', '2026-03']))
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      recurrence: 'monthly',
      startMonth: '2026-01',
      endMonth: '2026-03',
      amountCents: 10000,
      day: 10,
      overrides: [],
    })
  })

  it('tolerates gaps of up to 3 months as skipped overrides and cuts longer gaps', () => {
    const { entries } = groupIntoEntries(months(['2026-01', '2026-04', '2026-09', '2026-10']))
    expect(entries.map((e) => [e.startMonth, e.endMonth])).toEqual([
      ['2026-01', '2026-04'],
      ['2026-09', '2026-10'],
    ])
    expect(entries[0]?.overrides).toEqual([
      { month: '2026-02', amountCents: null, day: null, skipped: true },
      { month: '2026-03', amountCents: null, day: null, skipped: true },
    ])
  })

  it('detects yearly series when every gap is exactly 12 months', () => {
    const { entries } = groupIntoEntries(months(['2025-03', '2026-03', '2027-03']))
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      recurrence: 'yearly',
      startMonth: '2025-03',
      endMonth: '2027-03',
    })
  })

  it('splits parallel rows of the same month into separate lanes', () => {
    const lanes = splitLanes(months(['2026-01', '2026-01', '2026-02', '2026-02']))
    expect(lanes.map((lane) => lane.map((i) => i.month))).toEqual([
      ['2026-01', '2026-02'],
      ['2026-01', '2026-02'],
    ])
    expect(
      groupIntoEntries(months(['2026-01', '2026-01', '2026-02'])).entries.map((e) => e.recurrence),
    ).toEqual(['monthly', 'none'])
  })

  it('uses the mode as base and turns differing months into amount/day overrides', () => {
    const items = [
      item({ month: '2026-01', amountCents: 5000, day: 5 }),
      item({ month: '2026-02', amountCents: 5000, day: 5 }),
      item({ month: '2026-03', amountCents: 7000, day: 5 }),
      item({ month: '2026-04', amountCents: 5000, day: 8 }),
    ]
    const [entry] = groupIntoEntries(items).entries
    expect(entry).toMatchObject({ amountCents: 5000, day: 5 })
    expect(entry?.overrides).toEqual([
      { month: '2026-03', amountCents: 7000, day: null, skipped: false },
      { month: '2026-04', amountCents: null, day: 8, skipped: false },
    ])
  })

  it('keeps the most common original casing of the description', () => {
    const items = [
      item({ month: '2026-01', description: 'ALUGUEL' }),
      item({ month: '2026-02', description: 'Aluguel' }),
      item({ month: '2026-03', description: 'Aluguel' }),
    ]
    expect(groupIntoEntries(items).entries[0]?.description).toBe('Aluguel')
  })

  it('keeps different keys apart (movement, account, sub-category, type, tags)', () => {
    const items = [
      item({ month: '2026-01' }),
      item({ month: '2026-02', kind: 'income' }),
      item({ month: '2026-03', accountId: 'acc-2' }),
      item({ month: '2026-04', subCategory: 'Condomínio' }),
      item({ month: '2026-05', type: 'Variable' }),
      item({ month: '2026-06', tags: ['casa'] }),
    ]
    expect(groupIntoEntries(items).entries).toHaveLength(6)
  })

  it('skips zero-amount months and drops runs made only of zeros', () => {
    const items = [
      item({ month: '2026-01', amountCents: 4300 }),
      item({ month: '2026-02', amountCents: 0 }),
      item({ month: '2026-03', amountCents: 4300 }),
      item({ month: '2026-01', amountCents: 0, descriptionKey: 'zero', description: 'Zero' }),
    ]
    const result = groupIntoEntries(items)
    expect(result.zeroOnlyRuns).toBe(1)
    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]?.overrides).toEqual([
      { month: '2026-02', amountCents: null, day: null, skipped: true },
    ])
  })

  it('makes a single occurrence a one-off entry without end or overrides', () => {
    const [entry] = groupIntoEntries([item({ month: '2026-05', day: 31 })]).entries
    expect(entry).toMatchObject({ recurrence: 'none', endMonth: null, overrides: [], day: 31 })
  })
})
