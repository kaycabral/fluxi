import { monthRange, type Month } from '@/features/ledger/core/month'
import { landingsIn } from '@/features/ledger/core/occurrence'
import type { Entry, EntryOverride } from '@/features/ledger/core/types'
import type { Movement } from './records'

/**
 * Proof that the import is lossless: re-expands the ledger with the app's own
 * occurrence rules (`landingsIn`) and compares the money it moves with the
 * Notion originals, per (month, account, direction). Flows are signed like
 * the ledger (negative = money leaves the account). A transfer counts as an
 * outflow of its account and an inflow of its destination, exactly like the
 * two Notion rows it replaced.
 */

/** One money movement of an account in a month; `amountCents` signed (outflow negative). */
export type Flow = { month: Month; accountId: string; amountCents: number }

/** A Notion row's flow: its magnitude signed by its movement. */
export function signedFlowCents(movement: Movement, amountCents: number): number {
  return movement === 'Inflow' ? amountCents : -amountCents
}

export type FlowTotals = { inflowCents: number; outflowCents: number }

export type ComparisonRow = { key: string; notion: FlowTotals; fluxi: FlowTotals }

export type Verification = {
  byYear: ComparisonRow[]
  byAccount: ComparisonRow[]
  /** Cells of (month, account, direction) whose totals differ. */
  divergences: number
}

export type LedgerToVerify = {
  entries: readonly Entry[]
  overrides: readonly EntryOverride[]
}

/** Flows the ledger produces, month by month, through the app's projection rules. */
export function expandLedger(ledger: LedgerToVerify, months: readonly Month[]): Flow[] {
  const byEntry = new Map<string, EntryOverride[]>()
  for (const o of ledger.overrides) {
    const list = byEntry.get(o.entryId)
    if (list === undefined) byEntry.set(o.entryId, [o])
    else list.push(o)
  }
  const flows: Flow[] = []
  for (const entry of ledger.entries) {
    const overrides = byEntry.get(entry.id) ?? []
    for (const month of months) {
      for (const landing of landingsIn(entry, [], overrides, month)) {
        flows.push(...flowsOf(entry, month, landing.amountCents))
      }
    }
  }
  return flows
}

function flowsOf(entry: Entry, month: Month, amountCents: number): Flow[] {
  if (entry.kind === 'transfer') {
    return [
      { month, accountId: entry.accountId, amountCents },
      { month, accountId: entry.toAccountId ?? '', amountCents: -amountCents },
    ]
  }
  return [{ month, accountId: entry.accountId, amountCents }]
}

function totalsBy(flows: readonly Flow[], keyOf: (flow: Flow) => string): Map<string, FlowTotals> {
  const totals = new Map<string, FlowTotals>()
  for (const flow of flows) {
    const key = keyOf(flow)
    const slot = totals.get(key) ?? { inflowCents: 0, outflowCents: 0 }
    // Totals stay magnitudes per direction (the report prints them side by side).
    if (flow.amountCents > 0) slot.inflowCents += flow.amountCents
    else slot.outflowCents -= flow.amountCents
    totals.set(key, slot)
  }
  return totals
}

function compare(
  notion: readonly Flow[],
  fluxi: readonly Flow[],
  keyOf: (flow: Flow) => string,
): ComparisonRow[] {
  const a = totalsBy(notion, keyOf)
  const b = totalsBy(fluxi, keyOf)
  const zero = { inflowCents: 0, outflowCents: 0 }
  return [...new Set([...a.keys(), ...b.keys()])]
    .sort()
    .map((key) => ({ key, notion: a.get(key) ?? zero, fluxi: b.get(key) ?? zero }))
}

const divergencesOf = (row: ComparisonRow) =>
  Number(row.notion.inflowCents !== row.fluxi.inflowCents) +
  Number(row.notion.outflowCents !== row.fluxi.outflowCents)

/** Months covering every flow and every series. */
function spanOf(originals: readonly Flow[], ledger: LedgerToVerify): Month[] {
  const months = [
    ...originals.map((f) => f.month),
    ...ledger.entries.flatMap((e) => [e.startMonth, e.endMonth ?? e.startMonth]),
  ].sort()
  const first = months[0]
  const last = months.at(-1)
  return first === undefined || last === undefined ? [] : monthRange(first, last)
}

/** Compares the re-expanded ledger with the originals (account ids must match). */
export function verifyLedger(originals: readonly Flow[], ledger: LedgerToVerify): Verification {
  const expanded = expandLedger(ledger, spanOf(originals, ledger))
  const cells = compare(originals, expanded, (f) => `${f.month}|${f.accountId}`)
  return {
    byYear: compare(originals, expanded, (f) => f.month.slice(0, 4)),
    byAccount: compare(originals, expanded, (f) => f.accountId),
    divergences: cells.reduce((sum, row) => sum + divergencesOf(row), 0),
  }
}
