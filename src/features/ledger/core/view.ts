import type { EditTarget } from './entry-form'
import { diffMonths, monthRange, type Month } from './month'
import type { Landing } from './occurrence'
import type { OccurrencePayment } from './payments'
import { firstLandingMonth, projectMonths, type MonthResult } from './projection'
import type { Account, Bank, Category, Entry, EntryOverride, EntryPart, Pot } from './types'

/**
 * What the server hands the client views: the user's ledger over a window.
 * The views run the pure projection in the browser (it is cheap), so month
 * selection, filters and expansion need no round trip.
 */
export type LedgerData = {
  banks: Bank[]
  accounts: Account[]
  categories: Category[]
  /** Every pot, archived ones included (old entries still point at them). */
  pots: Pot[]
  entries: Entry[]
  parts: EntryPart[]
  overrides: EntryOverride[]
  payments: OccurrencePayment[]
}

/** Reference data the entry sheet needs on every page. */
export type LedgerRefs = {
  banks: Bank[]
  accounts: Account[]
  categories: Category[]
  /** Every pot, archived ones included; pickers show the active ones. */
  pots: Pot[]
  /** Every tag in use, sorted, for the tags autocomplete. */
  tags: string[]
  /** `YYYY-MM-DD` in São Paulo. */
  today: string
}

/**
 * Project `[from, to]`. Balances accumulate from each account's opening
 * balance over every entry, so the projection starts at the first month an
 * entry lands in when that is earlier and drops the months before `from`.
 */
export function projectWindow(data: LedgerData, from: Month, to: Month): MonthResult[] {
  const first = firstLandingMonth(data.entries)
  const start = first !== null && first < from ? first : from
  return projectMonths({
    entries: data.entries,
    parts: data.parts,
    overrides: data.overrides,
    accounts: data.accounts,
    months: monthRange(start, to),
  }).filter((m) => m.month >= from)
}

/** The sheet target for the occurrence a landing belongs to. */
export function targetFor(
  data: Pick<LedgerData, 'parts' | 'overrides'>,
  landing: Landing,
): EditTarget {
  const id = landing.entry.id
  return {
    entry: landing.entry,
    parts: data.parts.filter((p) => p.entryId === id),
    overrides: data.overrides.filter((o) => o.entryId === id),
    month: landing.competence,
  }
}

/** Distinct tags across entries, sorted. */
export function distinctTags(entries: readonly Pick<Entry, 'tags'>[]): string[] {
  return [...new Set(entries.flatMap((e) => e.tags))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
}

/** `n/N` for an installment occurrence, null otherwise. */
export function installmentLabel(landing: Landing): string | null {
  const { entry } = landing
  if (entry.recurrence !== 'installments' || entry.installments === null) return null
  return `${diffMonths(entry.startMonth, landing.competence) + 1}/${entry.installments}`
}
