import { describe, expect, it } from 'vitest'
import { record } from './fixtures'
import { toItems, TRANSFER_SUBCATEGORY } from './items'

const transferRow = (id: string, patch: Parameters<typeof record>[0]) =>
  record({ externalId: id, subCategory: TRANSFER_SUBCATEGORY, group: 'Transferências', ...patch })

describe('toItems', () => {
  it('pairs an outflow and an inflow of the same month, day and amount on different accounts', () => {
    const { items, transfersPaired } = toItems([
      transferRow('in', { movement: 'Inflow', accountId: 'acc-2', paidOn: '2026-01-10' }),
      record({ externalId: 'other' }),
      transferRow('out', { movement: 'Outflow', accountId: 'acc-1' }),
    ])
    expect(transfersPaired).toBe(1)
    expect(items.map((i) => i.kind)).toEqual(['expense', 'transfer'])
    expect(items[1]).toMatchObject({
      accountId: 'acc-1',
      toAccountId: 'acc-2',
      externalIds: ['out', 'in'],
      paidOn: '2026-01-10',
    })
  })

  it('signs a paired transfer from its source account (negative)', () => {
    const { items } = toItems([
      transferRow('in', { movement: 'Inflow', accountId: 'acc-2' }),
      transferRow('out', { movement: 'Outflow', accountId: 'acc-1' }),
    ])
    expect(items.map((i) => [i.kind, Math.sign(i.amountCents)])).toEqual([['transfer', -1]])
  })

  it('leaves unpaired rows as income/expense with their category', () => {
    const { items, transfersPaired } = toItems([
      transferRow('out', { movement: 'Outflow', accountId: 'acc-1' }),
      transferRow('same-account', { movement: 'Inflow', accountId: 'acc-1' }),
      transferRow('other-day', { movement: 'Inflow', accountId: 'acc-2', day: 11 }),
      transferRow('other-amount', { movement: 'Inflow', accountId: 'acc-2', amountCents: 1 }),
    ])
    expect(transfersPaired).toBe(0)
    expect(items.map((i) => i.kind)).toEqual(['expense', 'income', 'income', 'income'])
    // Signed like the ledger: outflows negative, inflows positive.
    expect(items.map((i) => Math.sign(i.amountCents))).toEqual([-1, 1, 1, 1])
    expect(items[0]?.subCategory).toBe(TRANSFER_SUBCATEGORY)
  })

  it('uses each inflow at most once', () => {
    const { items, transfersPaired } = toItems([
      transferRow('out-1', { movement: 'Outflow', accountId: 'acc-1' }),
      transferRow('out-2', { movement: 'Outflow', accountId: 'acc-3' }),
      transferRow('in', { movement: 'Inflow', accountId: 'acc-2' }),
    ])
    expect(transfersPaired).toBe(1)
    expect(items.map((i) => i.kind)).toEqual(['transfer', 'expense'])
  })
})
