import { entryMatchesAccounts } from './account-filter'
import { daysInMonth, type Month } from './month'
import type { Landing } from './occurrence'
import { effectOn, type MonthResult } from './projection'

export type CalendarDay = {
  day: number
  landings: Landing[]
  /** Balance of the selected accounts at the end of the day; null when the month is not counted. */
  endBalanceCents: number | null
}

export type CalendarMonth = {
  month: Month
  /** Empty cells before day 1 (0 = Sunday). */
  leadingBlanks: number
  days: CalendarDay[]
}

/** Weekday of the 1st, Sunday = 0. */
export function firstWeekday(month: Month): number {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(Date.UTC(year ?? 0, (monthNumber ?? 1) - 1, 1)).getUTCDay()
}

/** Month grid for the accounts `ids` (null = every account). */
export function calendarMonth(result: MonthResult, ids: readonly string[] | null): CalendarMonth {
  const opening = result.openingBalances
  const accountIds = ids ?? (opening === null ? [] : Object.keys(opening))
  let running: number | null =
    opening === null ? null : accountIds.reduce((sum, id) => sum + (opening[id] ?? 0), 0)

  const days: CalendarDay[] = []
  for (let day = 1; day <= daysInMonth(result.month); day += 1) {
    const landings = result.landings.filter(
      (l) => l.day === day && entryMatchesAccounts(l.entry, ids),
    )
    if (running !== null) {
      for (const landing of landings) {
        running += accountIds.reduce((sum, id) => sum + effectOn(landing, id), 0)
      }
    }
    days.push({ day, landings, endBalanceCents: running })
  }
  return { month: result.month, leadingBlanks: firstWeekday(result.month), days }
}
