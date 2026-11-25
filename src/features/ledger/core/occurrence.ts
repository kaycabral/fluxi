import {
  addMonths,
  daysInMonth,
  diffMonths,
  lastWeekdayDay,
  nthWeekdayDay,
  weekdayIn,
  type Month,
} from './month'
import type { Entry, EntryOverride, EntryPart } from './types'

/** One amount landing on one day of one month (a whole occurrence or one split part). */
export type Landing = {
  entry: Entry
  /** Month the money moves in. */
  month: Month
  /** Month of the occurrence it belongs to (earlier than `month` for a `nextMonth` part). */
  competence: Month
  /** Already clamped to the month's length. */
  day: number
  amountCents: number
  part: EntryPart | null
}

/** Installment count of an installment entry (0 when missing, which the database forbids). */
export function installmentCount(entry: Entry): number {
  return entry.installments ?? 0
}

/** Whether the series rule puts an occurrence in `month` (overrides aside). */
export function occursIn(entry: Entry, month: Month): boolean {
  const index = diffMonths(entry.startMonth, month)
  if (index < 0) return false
  const withinEnd = entry.endMonth === null || month <= entry.endMonth
  switch (entry.recurrence) {
    case 'none':
      return index === 0
    case 'yearly':
      return index % (12 * entry.repeatEvery) === 0 && withinEnd
    case 'installments':
      return index < installmentCount(entry)
    case 'monthly':
      return index % entry.repeatEvery === 0 && withinEnd
  }
}

function overrideFor(
  entry: Entry,
  overrides: readonly EntryOverride[],
  month: Month,
): EntryOverride | undefined {
  return overrides.find((o) => o.entryId === entry.id && o.month === month)
}

export function isSkipped(
  entry: Entry,
  overrides: readonly EntryOverride[],
  month: Month,
): boolean {
  return overrideFor(entry, overrides, month)?.skipped ?? false
}

/**
 * Split an installment total into `count` installments: equal floored shares,
 * the leftover cents on the first one (like a card statement), so they sum
 * exactly to the total.
 */
export function installmentShares(
  totalCents: number,
  count: number,
): { first: number; rest: number } {
  const n = Math.max(1, count)
  const rest = Math.floor(totalCents / n)
  return { first: totalCents - rest * (n - 1), rest }
}

/**
 * The series amount of the occurrence of `month`, overrides aside. For
 * installments `entry.amountCents` is the TOTAL, split by
 * {@link installmentShares}; otherwise it is the amount of every occurrence.
 */
export function seriesAmountFor(entry: Entry, month: Month): number {
  if (entry.recurrence !== 'installments') return entry.amountCents
  const { first, rest } = installmentShares(entry.amountCents, installmentCount(entry))
  return diffMonths(entry.startMonth, month) === 0 ? first : rest
}

/** Amount of the occurrence whose competence is `month` (an override wins). */
export function amountFor(entry: Entry, overrides: readonly EntryOverride[], month: Month): number {
  return overrideFor(entry, overrides, month)?.amountCents ?? seriesAmountFor(entry, month)
}

/**
 * The series day in `month`, overrides aside: the day number, or for a
 * weekday rule the nth (or last) weekday of the start date, in `month`.
 */
export function ruleDay(entry: Entry, month: Month): number {
  return dayByRule(entry, month)
}

/** {@link ruleDay} for a rule not saved yet (the repetition dialog). */
export function dayByRule(
  rule: Pick<Entry, 'startMonth' | 'day' | 'monthBy'>,
  month: Month,
): number {
  if (rule.monthBy === 'day') return rule.day
  const anchor = Math.min(rule.day, daysInMonth(rule.startMonth))
  const weekday = weekdayIn(rule.startMonth, anchor)
  if (rule.monthBy === 'last_weekday') return lastWeekdayDay(month, weekday)
  return nthWeekdayDay(month, weekday, Math.ceil(anchor / 7))
}

/** Day of the occurrence whose competence is `month` (an override wins), unclamped. */
export function dayFor(entry: Entry, overrides: readonly EntryOverride[], month: Month): number {
  return overrideFor(entry, overrides, month)?.day ?? ruleDay(entry, month)
}

/**
 * Split `amountCents` by the parts' basis points, in part order. Each share is
 * floored; when the parts total exactly 10000 bps the last part takes the
 * rounding remainder, so the shares sum exactly to the amount. (Parts that do
 * not total 10000 bps are invalid input; they get plain floored shares.)
 */
export function splitAmount(amountCents: number, parts: readonly EntryPart[]): number[] {
  const shares = parts.map((part) => Math.floor((amountCents * part.bps) / 10000))
  const totalBps = parts.reduce((sum, part) => sum + part.bps, 0)
  if (totalBps === 10000 && shares.length > 0) {
    const others = shares.slice(0, -1).reduce((sum, share) => sum + share, 0)
    shares[shares.length - 1] = amountCents - others
  }
  return shares
}

export function sortParts(parts: readonly EntryPart[]): EntryPart[] {
  return [...parts].sort((a, b) => a.sort - b.sort)
}

/**
 * What lands in `month` for one entry. Without parts: the occurrence of
 * `month`, if any. With parts: each part of the occurrence of `month`, or of
 * the previous month for a `nextMonth` part. A skipped occurrence lands nothing
 * (none of its parts either); days are clamped to the month's length.
 */
export function landingsIn(
  entry: Entry,
  parts: readonly EntryPart[],
  overrides: readonly EntryOverride[],
  month: Month,
): Landing[] {
  return landingsWhere({ entry, parts, overrides }, month, false)
}

/**
 * The opposite of {@link landingsIn}: what WOULD land in `month` from the
 * skipped occurrences (to show them as ignored; they never count). Occurrences
 * the user deleted are gone, not ignored: they never show.
 */
export function skippedLandingsIn(
  entry: Entry,
  parts: readonly EntryPart[],
  overrides: readonly EntryOverride[],
  month: Month,
): Landing[] {
  const ignored = overrides.filter((o) => !o.deleted)
  return landingsWhere({ entry, parts, overrides: ignored }, month, true)
}

type Series = {
  entry: Entry
  parts: readonly EntryPart[]
  overrides: readonly EntryOverride[]
}

function landingsWhere(
  { entry, parts, overrides }: Series,
  month: Month,
  skipped: boolean,
): Landing[] {
  const lastDay = daysInMonth(month)
  const lands = (competence: Month) =>
    occursIn(entry, competence) && isSkipped(entry, overrides, competence) === skipped
  const ownParts = sortParts(parts.filter((p) => p.entryId === entry.id))

  if (ownParts.length === 0) {
    if (!lands(month)) return []
    return [
      {
        entry,
        month,
        competence: month,
        day: Math.min(dayFor(entry, overrides, month), lastDay),
        amountCents: amountFor(entry, overrides, month),
        part: null,
      },
    ]
  }

  const out: Landing[] = []
  ownParts.forEach((part, index) => {
    const competence = part.nextMonth ? addMonths(month, -1) : month
    if (!lands(competence)) return
    const shares = splitAmount(amountFor(entry, overrides, competence), ownParts)
    out.push({
      entry,
      month,
      competence,
      day: Math.min(part.day, lastDay),
      amountCents: shares[index] ?? 0,
      part,
    })
  })
  return out
}
