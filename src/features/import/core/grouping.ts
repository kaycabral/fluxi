import { addMonths, diffMonths, type Month } from '@/features/ledger/core/month'
import type { EntryKind, Recurrence } from '@/features/ledger/core/types'
import type { LedgerItem } from './items'

/**
 * Folds items into recurring entries. Items sharing a key (description,
 * movement, accounts, sub-category, type, tags) are split into lanes (one
 * occurrence per month each, so parallel rows of the same month become
 * separate series); a lane whose gaps are all exactly 12 months is yearly,
 * otherwise it is cut into monthly runs that tolerate gaps of up to
 * {@link MAX_MONTHLY_GAP} months (missing months become skipped overrides). The
 * series amount/day is the mode of the run; differing months become overrides.
 * A zero-amount occurrence (the ledger requires a non-zero signed amount) is a
 * skipped month; a run
 * of only zeros produces nothing.
 */

export const MAX_MONTHLY_GAP = 3

export type PlannedOverride = {
  month: Month
  amountCents: number | null
  day: number | null
  skipped: boolean
}

export type PlannedOccurrence = { month: Month; item: LedgerItem }

export type PlannedEntry = {
  /** Stable local id within one plan (`e<n>`). */
  key: string
  kind: EntryKind
  description: string
  amountCents: number
  day: number
  accountId: string
  toAccountId: string | null
  group: string | null
  subCategory: string | null
  type: string | null
  tags: readonly string[]
  startMonth: Month
  endMonth: Month | null
  recurrence: Exclude<Recurrence, 'installments'>
  overrides: PlannedOverride[]
  /** Every source item of the series, including zero-amount (skipped) ones. */
  occurrences: PlannedOccurrence[]
}

export type GroupingResult = {
  entries: PlannedEntry[]
  /** Runs made only of zero-amount items (not representable in the ledger). */
  zeroOnlyRuns: number
}

function groupKey(item: LedgerItem): string {
  return [
    item.descriptionKey,
    item.kind,
    item.accountId,
    item.toAccountId ?? '',
    item.subCategory ?? '',
    item.type ?? '',
    item.tags.join('\u0001'),
  ].join('\u0000')
}

/** Most frequent value; ties go to the first one seen (like Python's Counter). */
export function mode<T>(values: readonly T[]): T | undefined {
  const counts = new Map<T, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  let best: T | undefined
  let bestCount = 0
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

/** First lane whose last month is before the item's; else a new lane. */
export function splitLanes(items: readonly LedgerItem[]): LedgerItem[][] {
  const sorted = [...items].sort((a, b) => a.month.localeCompare(b.month) || a.day - b.day)
  const lanes: LedgerItem[][] = []
  for (const item of sorted) {
    const lane = lanes.find((l) => (l.at(-1)?.month ?? '') < item.month)
    if (lane === undefined) lanes.push([item])
    else lane.push(item)
  }
  return lanes
}

function isYearly(lane: readonly LedgerItem[]): boolean {
  if (lane.length < 2) return false
  return lane
    .slice(1)
    .every((item, i) => diffMonths(lane[i]?.month ?? item.month, item.month) === 12)
}

/** Consecutive runs of a lane (step 12 for yearly; monthly gaps up to the max). */
export function splitRuns(lane: readonly LedgerItem[]): { runs: LedgerItem[][]; step: 1 | 12 } {
  const step = isYearly(lane) ? 12 : 1
  const runs: LedgerItem[][] = []
  for (const item of lane) {
    const run = runs.at(-1)
    const last = run?.at(-1)
    const gap = last === undefined ? Infinity : diffMonths(last.month, item.month)
    const fits = step === 12 ? gap === 12 : gap <= MAX_MONTHLY_GAP
    if (run !== undefined && fits) run.push(item)
    else runs.push([item])
  }
  return { runs, step }
}

type Run = { items: readonly LedgerItem[]; first: LedgerItem; last: LedgerItem; step: 1 | 12 }

function overridesOf(run: Run, base: { amountCents: number; day: number }): PlannedOverride[] {
  const byMonth = new Map(run.items.map((item) => [item.month, item]))
  const { step } = run
  const first = run.first.month
  const span = diffMonths(first, run.last.month) / step + 1
  const out: PlannedOverride[] = []
  for (let i = 0; i < span; i++) {
    const month = addMonths(first, i * step)
    const item = byMonth.get(month)
    if (item === undefined || item.amountCents === 0) {
      out.push({ month, amountCents: null, day: null, skipped: true })
      continue
    }
    const amountCents = item.amountCents === base.amountCents ? null : item.amountCents
    const day = item.day === base.day ? null : item.day
    if (amountCents !== null || day !== null) out.push({ month, amountCents, day, skipped: false })
  }
  return out
}

function recurrenceOf(size: number, step: 1 | 12): PlannedEntry['recurrence'] {
  if (size === 1) return 'none'
  return step === 12 ? 'yearly' : 'monthly'
}

function entryOf(run: Run, key: string): PlannedEntry | null {
  const { items, first, step } = run
  const paying = items.filter((item) => item.amountCents !== 0)
  const amountCents = mode(paying.map((item) => item.amountCents))
  const day = mode(items.map((item) => item.day))
  if (amountCents === undefined || day === undefined) return null
  const single = items.length === 1
  return {
    key,
    kind: first.kind,
    description: mode(items.map((item) => item.description)) ?? first.description,
    amountCents,
    day,
    accountId: first.accountId,
    toAccountId: first.toAccountId,
    group: mode(items.map((item) => item.group)) ?? null,
    subCategory: first.subCategory,
    type: first.type,
    tags: first.tags,
    startMonth: first.month,
    endMonth: single ? null : run.last.month,
    recurrence: recurrenceOf(items.length, step),
    overrides: single ? [] : overridesOf(run, { amountCents, day }),
    occurrences: items.map((item) => ({ month: item.month, item })),
  }
}

function groupByKey(items: readonly LedgerItem[]): LedgerItem[][] {
  const groups = new Map<string, LedgerItem[]>()
  for (const item of items) {
    const key = groupKey(item)
    const group = groups.get(key)
    if (group === undefined) groups.set(key, [item])
    else group.push(item)
  }
  return [...groups.values()]
}

/** Every run of every group, in group → lane → run order. */
function runsOf(items: readonly LedgerItem[]): Run[] {
  return groupByKey(items).flatMap((group) =>
    splitLanes(group).flatMap((lane) => {
      const { runs, step } = splitRuns(lane)
      return runs.flatMap((run) => {
        const first = run[0]
        const last = run.at(-1)
        return first === undefined || last === undefined ? [] : [{ items: run, first, last, step }]
      })
    }),
  )
}

/** Items (source order) → planned entries. */
export function groupIntoEntries(items: readonly LedgerItem[]): GroupingResult {
  const result: GroupingResult = { entries: [], zeroOnlyRuns: 0 }
  for (const run of runsOf(items)) {
    const entry = entryOf(run, `e${result.entries.length + 1}`)
    if (entry === null) result.zeroOnlyRuns += 1
    else result.entries.push(entry)
  }
  return result
}
