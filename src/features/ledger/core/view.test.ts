import { describe, expect, it } from 'vitest'
import { makeEntry, makeOverride, makePart } from './fixtures'
import { landingsIn } from './occurrence'
import { targetFor } from './view'

describe('targetFor', () => {
  it('takes only the parts and overrides of the landing entry', () => {
    const entry = makeEntry({ id: 'luz', recurrence: 'monthly', startMonth: '2026-12' })
    const parts = [makePart({ id: 'p1', entryId: 'luz' }), makePart({ id: 'p2', entryId: 'other' })]
    const overrides = [
      makeOverride({ entryId: 'luz', month: '2027-01', amountCents: 300 }),
      makeOverride({ entryId: 'other', month: '2027-01', amountCents: 9 }),
    ]
    const [landing] = landingsIn(entry, [], [], '2027-01')
    if (landing === undefined) throw new Error('no landing')
    const target = targetFor({ parts, overrides }, landing)
    expect(target.month).toBe('2027-01')
    expect(target.parts.map((p) => p.id)).toEqual(['p1'])
    expect(target.overrides).toEqual([overrides[0]])
  })
})
