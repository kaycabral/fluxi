import type { Month } from '@/features/ledger/core/month'
import type { LedgerItem } from './items'

/**
 * Fake mirror outflows in benefit accounts. Before Fluxi separated benefits
 * from available money, the Notion workspace logged an outflow mirroring each
 * benefit credit so the credit would not inflate the balance. Fluxi keeps
 * benefits apart on its own, so the FUTURE mirrors are dropped: an outflow of
 * a benefit account, in a month from `fromMonth` on, not paid yet, whose
 * amount equals an inflow of the same account and month (one inflow cancels
 * at most one mirror). Past or paid mirrors stay as history. Dropping happens
 * before grouping, so the series are built from the remaining occurrences
 * (a gap becomes a skipped month or splits the series) and stay lossless
 * relative to them.
 */

export type MirrorSplit = { kept: LedgerItem[]; dropped: LedgerItem[] }

const slotOf = (item: Pick<LedgerItem, 'accountId' | 'month'>) => `${item.accountId}|${item.month}`

export function dropBenefitMirrors(
  items: readonly LedgerItem[],
  benefitAccountIds: ReadonlySet<string>,
  fromMonth: Month,
): MirrorSplit {
  const inBenefit = (item: LedgerItem) =>
    benefitAccountIds.has(item.accountId) && item.amountCents > 0
  // Inflow amounts still available to cancel a mirror, per account and month.
  const inflows = new Map<string, number[]>()
  for (const item of items) {
    if (item.kind !== 'income' || !inBenefit(item)) continue
    inflows.set(slotOf(item), [...(inflows.get(slotOf(item)) ?? []), item.amountCents])
  }
  const result: MirrorSplit = { kept: [], dropped: [] }
  for (const item of items) {
    const candidate =
      item.kind === 'expense' && inBenefit(item) && item.month >= fromMonth && item.paidOn === null
    const amounts = candidate ? (inflows.get(slotOf(item)) ?? []) : []
    const match = amounts.indexOf(item.amountCents)
    if (match < 0) {
      result.kept.push(item)
      continue
    }
    amounts.splice(match, 1)
    result.dropped.push(item)
  }
  return result
}
