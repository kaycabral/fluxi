import { describe, expect, it } from 'vitest'
import { cutEntry, planCut } from './cut'
import { makeEntry } from './fixtures'
import { landingsIn } from './occurrence'

const CUT = '2026-12'

describe('cutEntry', () => {
  it('keeps what starts at the cut or later', () => {
    expect(cutEntry(makeEntry({ startMonth: '2026-12' }), CUT)).toEqual({ type: 'keep' })
  })

  it('deletes one-offs before the cut', () => {
    expect(cutEntry(makeEntry({ recurrence: 'none', startMonth: '2026-11' }), CUT)).toEqual({
      type: 'delete',
    })
  })

  it('moves a monthly series to its first occurrence from the cut, keeping the rhythm', () => {
    const monthly = makeEntry({ startMonth: '2026-09' })
    expect(cutEntry(monthly, CUT)).toEqual({ type: 'move', entry: { ...monthly, startMonth: CUT } })
    const quarterly = makeEntry({ startMonth: '2026-10', repeatEvery: 3 })
    expect(cutEntry(quarterly, CUT)).toMatchObject({ entry: { startMonth: '2027-01' } })
    const yearly = makeEntry({ recurrence: 'yearly', startMonth: '2025-03' })
    expect(cutEntry(yearly, CUT)).toMatchObject({ entry: { startMonth: '2027-03' } })
  })

  it('deletes a series that has nothing left from the cut on', () => {
    expect(cutEntry(makeEntry({ startMonth: '2026-01', endMonth: '2026-11' }), CUT)).toEqual({
      type: 'delete',
    })
    expect(
      cutEntry(makeEntry({ startMonth: '2026-10', endMonth: '2026-12', repeatEvery: 3 }), CUT),
    ).toEqual({ type: 'delete' })
    expect(
      cutEntry(
        makeEntry({ recurrence: 'installments', installments: 2, startMonth: '2026-10' }),
        CUT,
      ),
    ).toEqual({ type: 'delete' })
  })

  it('keeps the remaining installments with the slice of the total they carry', () => {
    // 1000,01 in 4: 250,01 + 3 × 250,00. Two are due before the cut.
    const series = makeEntry({
      recurrence: 'installments',
      installments: 4,
      amountCents: -100001,
      startMonth: '2026-10',
    })
    const action = cutEntry(series, CUT)
    if (action.type !== 'move') throw new Error('expected a move')
    expect(action.entry).toMatchObject({ startMonth: CUT, installments: 2, amountCents: -50000 })
    const before = landingsIn(series, [], [], '2027-01')[0]?.amountCents
    expect(landingsIn(action.entry, [], [], '2027-01')[0]?.amountCents).toBe(before)
  })
})

describe('planCut', () => {
  it('sorts entries into deleted, moved and kept, never touching protected ones', () => {
    const plan = planCut(
      [
        makeEntry({ id: 'a', recurrence: 'none', startMonth: '2026-10' }),
        makeEntry({ id: 'b', startMonth: '2026-10' }),
        makeEntry({ id: 'c', startMonth: '2027-01' }),
        makeEntry({ id: 'bank', recurrence: 'none', startMonth: '2026-10' }),
      ],
      CUT,
      new Set(['bank']),
    )
    expect(plan.deleted).toEqual(['a'])
    expect(plan.moved.map((e) => [e.id, e.startMonth])).toEqual([['b', CUT]])
    expect(plan.kept).toBe(2)
  })
})
