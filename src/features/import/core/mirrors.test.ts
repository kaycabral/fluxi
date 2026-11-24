import { describe, expect, it } from 'vitest'
import { item } from './fixtures'
import { dropBenefitMirrors } from './mirrors'

const BENEFITS = new Set(['va'])
const credit = (month: string, amountCents = 80000, id = `in-${month}`) =>
  item({ kind: 'income', accountId: 'va', month, amountCents, externalIds: [id] })
const mirror = (month: string, patch: Parameters<typeof item>[0] = {}) =>
  item({ accountId: 'va', month, amountCents: 80000, externalIds: [`out-${month}`], ...patch })

const ids = (items: readonly { externalIds: readonly string[] }[]) =>
  items.flatMap((i) => i.externalIds)

describe('dropBenefitMirrors', () => {
  it('drops unpaid future outflows equal to a credit of the same benefit account and month', () => {
    const items = [credit('2026-12'), mirror('2026-12'), credit('2027-01'), mirror('2027-01')]
    const { kept, dropped } = dropBenefitMirrors(items, BENEFITS, '2026-12')
    expect(ids(dropped)).toEqual(['out-2026-12', 'out-2027-01'])
    expect(ids(kept)).toEqual(['in-2026-12', 'in-2027-01'])
  })

  it('keeps past and paid mirrors as history', () => {
    const items = [
      credit('2026-11'),
      mirror('2026-11'),
      credit('2026-12'),
      mirror('2026-12', { paidOn: '2026-12-01' }),
    ]
    expect(dropBenefitMirrors(items, BENEFITS, '2026-12').dropped).toEqual([])
  })

  it('needs the same amount, account and month, and an available-money account never matches', () => {
    const items = [
      credit('2027-01'),
      mirror('2027-01', { amountCents: 79999 }),
      mirror('2027-02'),
      item({ accountId: 'checking', month: '2027-01', amountCents: 80000 }),
      item({ kind: 'income', accountId: 'checking', month: '2027-03', amountCents: 5000 }),
      item({ accountId: 'checking', month: '2027-03', amountCents: 5000 }),
      credit('2027-03', 0),
      mirror('2027-03', { amountCents: 0 }),
    ]
    expect(dropBenefitMirrors(items, BENEFITS, '2026-12').dropped).toEqual([])
  })

  it('cancels one mirror per credit and ignores transfers', () => {
    const items = [
      credit('2027-01'),
      mirror('2027-01', { externalIds: ['a'] }),
      mirror('2027-01', { externalIds: ['b'] }),
      item({
        kind: 'transfer',
        accountId: 'va',
        toAccountId: 'vr',
        month: '2027-01',
        amountCents: 80000,
        externalIds: ['t'],
      }),
    ]
    const { kept, dropped } = dropBenefitMirrors(items, BENEFITS, '2026-12')
    expect(ids(dropped)).toEqual(['a'])
    expect(ids(kept)).toEqual(['in-2027-01', 'b', 't'])
  })
})
