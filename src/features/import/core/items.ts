import type { EntryKind } from '@/features/ledger/core/types'
import type { TxRecord } from './records'

/**
 * Ledger items: records ready for grouping. An income/expense item is one
 * record; a transfer item is a paired outflow + inflow ("Mesma titularidade"
 * with the same month, day and amount on different accounts).
 */

export const TRANSFER_SUBCATEGORY = 'Mesma titularidade'

export type LedgerItem = {
  kind: EntryKind
  month: string
  day: number
  amountCents: number
  accountId: string
  toAccountId: string | null
  description: string
  descriptionKey: string
  group: string | null
  subCategory: string | null
  type: string | null
  tags: readonly string[]
  paidOn: string | null
  /** The Notion rows this item came from (two for a transfer). */
  externalIds: readonly string[]
}

function single(record: TxRecord): LedgerItem {
  return {
    kind: record.movement === 'Inflow' ? 'income' : 'expense',
    month: record.month,
    day: record.day,
    amountCents: record.amountCents,
    accountId: record.accountId,
    toAccountId: null,
    description: record.description,
    descriptionKey: record.descriptionKey,
    group: record.group,
    subCategory: record.subCategory,
    type: record.type,
    tags: record.tags,
    paidOn: record.paidOn,
    externalIds: [record.externalId],
  }
}

function transfer(outflow: TxRecord, inflow: TxRecord): LedgerItem {
  return {
    ...single(outflow),
    kind: 'transfer',
    toAccountId: inflow.accountId,
    paidOn: outflow.paidOn ?? inflow.paidOn,
    externalIds: [outflow.externalId, inflow.externalId],
  }
}

const bucketKey = (r: TxRecord) => `${r.month}|${r.day}|${r.amountCents}`

/** Inflow partner of each paired outflow (by record index), first match in source order. */
function pairIndexes(records: readonly TxRecord[]): Map<number, number> {
  const inflows = new Map<string, number[]>()
  records.forEach((r, i) => {
    if (r.subCategory !== TRANSFER_SUBCATEGORY || r.movement !== 'Inflow') return
    inflows.set(bucketKey(r), [...(inflows.get(bucketKey(r)) ?? []), i])
  })
  const pairs = new Map<number, number>()
  records.forEach((r, i) => {
    if (r.subCategory !== TRANSFER_SUBCATEGORY || r.movement !== 'Outflow') return
    const candidates = inflows.get(bucketKey(r)) ?? []
    const match = candidates.find((j) => records[j]?.accountId !== r.accountId)
    if (match === undefined) return
    pairs.set(i, match)
    inflows.set(
      bucketKey(r),
      candidates.filter((j) => j !== match),
    )
  })
  return pairs
}

/**
 * Records → items in source order; a paired transfer sits at its outflow's
 * position. Unpaired "Mesma titularidade" rows stay income/expense.
 */
export function toItems(records: readonly TxRecord[]): {
  items: LedgerItem[]
  transfersPaired: number
} {
  const pairs = pairIndexes(records)
  const pairedInflows = new Set(pairs.values())
  const items: LedgerItem[] = []
  records.forEach((record, i) => {
    if (pairedInflows.has(i)) return
    const partner = pairs.get(i)
    const inflow = partner === undefined ? undefined : records[partner]
    items.push(inflow === undefined ? single(record) : transfer(record, inflow))
  })
  return { items, transfersPaired: pairs.size }
}
