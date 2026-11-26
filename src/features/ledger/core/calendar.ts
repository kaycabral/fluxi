import { entryMatchesAccounts } from './account-filter'
import { daysInMonth, type Month } from './month'
import type { Landing } from './occurrence'
import { effectOn, type MonthResult } from './projection'

export type CalendarDay = {
  day: number
  landings: Landing[]
  /** Balance of the selected accounts at the end of the day. */
  endBalanceCents: number
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
  const accountIds = ids ?? Object.keys(opening)
  let running = accountIds.reduce((sum, id) => sum + (opening[id] ?? 0), 0)

  const days: CalendarDay[] = []
  for (let day = 1; day <= daysInMonth(result.month); day += 1) {
    const landings = result.landings.filter(
      (l) => l.day === day && entryMatchesAccounts(l.entry, ids),
    )
    for (const landing of landings) {
      running += accountIds.reduce((sum, id) => sum + effectOn(landing, id), 0)
    }
    days.push({ day, landings, endBalanceCents: running })
  }
  return { month: result.month, leadingBlanks: firstWeekday(result.month), days }
}

/** A whole occurrence dragged to another day of the month, shown there until the server confirms. */
export type DayMove = { entryId: string; competence: Month; day: number }

/**
 * Whether a landing can be dragged to another day: whole occurrences only (a
 * split entry's parts carry their own days and are edited in the sheet), and
 * never a bank entry (the bank owns its date).
 */
export function isMovable(landing: Landing): boolean {
  return landing.part === null && !landing.entry.fromBank
}

/** The days with pending `moves` applied: each moved occurrence leaves its day for the new one. */
export function withMoves(days: readonly CalendarDay[], moves: readonly DayMove[]): CalendarDay[] {
  if (moves.length === 0) return [...days]
  const moveOf = (landing: Landing): DayMove | undefined =>
    isMovable(landing)
      ? moves.findLast((m) => m.entryId === landing.entry.id && m.competence === landing.competence)
      : undefined
  const moved: Landing[] = []
  const kept = days.map((d) => ({
    ...d,
    landings: d.landings.filter((landing) => {
      const move = moveOf(landing)
      if (move === undefined || move.day === d.day) return true
      moved.push({ ...landing, day: move.day })
      return false
    }),
  }))
  return kept.map((d) => ({
    ...d,
    landings: [...d.landings, ...moved.filter((landing) => landing.day === d.day)],
  }))
}
