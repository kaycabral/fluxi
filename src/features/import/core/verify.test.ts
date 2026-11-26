import { makeEntry } from '@/features/ledger/core/fixtures'
import { describe, expect, it } from 'vitest'
import { expandLedger, verifyLedger, type Flow } from './verify'

const flow = (month: string, amountCents: number, patch: Partial<Flow> = {}): Flow => ({
  month,
  accountId: 'checking',
  amountCents,
  ...patch,
})

describe('verifyLedger', () => {
  const entry = makeEntry({ startMonth: '2026-01', endMonth: '2026-03', amountCents: -1000 })
  const overrides = [
    {
      entryId: 'e1',
      month: '2026-02',
      amountCents: null,
      day: null,
      skipped: true,
      deleted: false,
    },
  ]

  it('accepts a ledger that reproduces the originals', () => {
    const result = verifyLedger([flow('2026-01', -1000), flow('2026-03', -1000)], {
      entries: [entry],
      overrides,
    })
    expect(result.divergences).toBe(0)
    expect(result.byYear).toEqual([
      {
        key: '2026',
        notion: { inflowCents: 0, outflowCents: 2000 },
        fluxi: { inflowCents: 0, outflowCents: 2000 },
      },
    ])
  })

  it('counts every diverging (month, account, direction) cell', () => {
    const result = verifyLedger(
      [flow('2026-01', -1000), flow('2026-02', -1000), flow('2026-04', 5)],
      {
        entries: [entry],
        overrides,
      },
    )
    expect(result.divergences).toBe(3)
    expect(result.byAccount[0]?.notion).toEqual({ inflowCents: 5, outflowCents: 2000 })
    expect(result.byAccount[0]?.fluxi).toEqual({ inflowCents: 0, outflowCents: 2000 })
  })

  it('expands transfers as an outflow and an inflow, and income as inflow', () => {
    const transfer = makeEntry({
      id: 't',
      kind: 'transfer',
      toAccountId: 'savings',
      budgetGroup: null,
      recurrence: 'none',
      startMonth: '2026-01',
    })
    const income = makeEntry({
      id: 'i',
      kind: 'income',
      amountCents: 26000,
      budgetGroup: null,
      recurrence: 'none',
      startMonth: '2026-01',
    })
    expect(expandLedger({ entries: [transfer, income], overrides: [] }, ['2026-01'])).toEqual([
      flow('2026-01', -26000),
      flow('2026-01', 26000, { accountId: 'savings' }),
      flow('2026-01', 26000),
    ])
  })

  it('handles an empty ledger', () => {
    expect(verifyLedger([], { entries: [], overrides: [] })).toEqual({
      byYear: [],
      byAccount: [],
      divergences: 0,
    })
  })
})
