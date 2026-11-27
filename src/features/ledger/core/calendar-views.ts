import { entryMatchesAccounts } from './account-filter'
import { calendarMonth } from './calendar'
import { addMonths, daysInMonth, type Month } from './month'
import { skippedLandingsIn, type Landing } from './occurrence'
import { archivedFilter, type MonthResult } from './projection'
import type { Account, Entry, EntryOverride, EntryPart } from './types'

/**
 * The calendar's view modes, like Google Calendar's: which days a view shows
 * around a date, how it moves (prev/next) and its title. Dates are
 * `YYYY-MM-DD` and the week starts on Sunday. Pure: the page loads the months
 * a view needs ({@link viewMonths}) and the client lays them out.
 */

export const CALENDAR_VIEWS = ['day', 'week', 'month', 'year', 'schedule', 'four_days'] as const
export type CalendarViewMode = (typeof CALENDAR_VIEWS)[number]

export const VIEW_LABELS: Record<CalendarViewMode, string> = {
  day: 'Dia',
  week: 'Semana',
  month: 'Mês',
  year: 'Ano',
  schedule: 'Programação',
  four_days: '4 dias',
}

/** Keyboard shortcut of each view (Google Calendar's). */
export const VIEW_SHORTCUTS: Record<CalendarViewMode, string> = {
  day: 'D',
  week: 'W',
  month: 'M',
  year: 'Y',
  schedule: 'A',
  four_days: 'X',
}

/** `?modo=` value of each view (routes are pt-BR). */
export const VIEW_SLUGS: Record<CalendarViewMode, string> = {
  day: 'dia',
  week: 'semana',
  month: 'mes',
  year: 'ano',
  schedule: 'programacao',
  four_days: '4dias',
}

export function viewFromSlug(slug: string): CalendarViewMode | null {
  return CALENDAR_VIEWS.find((view) => VIEW_SLUGS[view] === slug) ?? null
}

/** How many months the schedule lists from its date. */
export const SCHEDULE_MONTHS = 12

function toUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}

function fromUtc(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function addDays(iso: string, count: number): string {
  const date = toUtc(iso)
  date.setUTCDate(date.getUTCDate() + count)
  return fromUtc(date)
}

/** Sunday = 0. */
export function weekdayOf(iso: string): number {
  return toUtc(iso).getUTCDay()
}

export function isWeekend(iso: string): boolean {
  const weekday = weekdayOf(iso)
  return weekday === 0 || weekday === 6
}

/** The Sunday of `iso`'s week. */
export function startOfWeek(iso: string): string {
  return addDays(iso, -weekdayOf(iso))
}

export function dayRange(from: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => addDays(from, i))
}

/** Every day of `month`. */
export function monthDays(month: Month): string[] {
  return dayRange(`${month}-01`, daysInMonth(month))
}

/** The full weeks (Sunday to Saturday) covering `month`: 4 to 6 rows of 7 days. */
export function monthWeeks(month: Month): string[][] {
  const first = startOfWeek(`${month}-01`)
  const last = `${month}-${String(daysInMonth(month)).padStart(2, '0')}`
  const weeks: string[][] = []
  for (let start = first; start <= last; start = addDays(start, 7)) {
    weeks.push(dayRange(start, 7))
  }
  return weeks
}

/** The days of a day-column view (day, week, 4 days). */
export function columnDays(view: 'day' | 'week' | 'four_days', date: string): string[] {
  if (view === 'day') return [date]
  if (view === 'four_days') return dayRange(date, 4)
  return dayRange(startOfWeek(date), 7)
}

/** The months a view needs projected around `date` (inclusive). */
export function viewMonths(view: CalendarViewMode, date: string): { from: Month; to: Month } {
  const month = date.slice(0, 7)
  switch (view) {
    case 'month':
      // Leading/trailing days of the neighbour months show in the grid.
      return { from: addMonths(month, -1), to: addMonths(month, 1) }
    case 'year':
      return { from: `${date.slice(0, 4)}-01`, to: `${date.slice(0, 4)}-12` }
    case 'schedule':
      return { from: month, to: addMonths(month, SCHEDULE_MONTHS - 1) }
    case 'day':
    case 'week':
    case 'four_days': {
      const days = columnDays(view, date)
      return { from: (days[0] ?? date).slice(0, 7), to: (days.at(-1) ?? date).slice(0, 7) }
    }
  }
}

/** The date of the previous (`-1`) or next (`1`) page of a view. */
export function shiftDate(view: CalendarViewMode, date: string, step: -1 | 1): string {
  switch (view) {
    case 'day':
      return addDays(date, step)
    case 'four_days':
      return addDays(date, 4 * step)
    case 'week':
      return addDays(date, 7 * step)
    case 'month':
      return `${addMonths(date.slice(0, 7), step)}-01`
    case 'year':
      return `${Number(date.slice(0, 4)) + step}-01-01`
    case 'schedule':
      return `${addMonths(date.slice(0, 7), step * SCHEDULE_MONTHS)}-01`
  }
}

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

function monthName(month: Month): string {
  return MONTHS[Number(month.slice(5, 7)) - 1] ?? ''
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase('pt-BR') + text.slice(1)
}

function shortMonth(month: Month): string {
  const name = monthName(month)
  return name.length <= 4 ? name : `${name.slice(0, 3)}.`
}

/** Title over the grid: "Novembro de 2026", "Nov. – dez. de 2026", "10 de novembro de 2026", "2026". */
export function viewTitle(view: CalendarViewMode, date: string): string {
  const month = date.slice(0, 7)
  const year = date.slice(0, 4)
  switch (view) {
    case 'month':
      return `${capitalize(monthName(month))} de ${year}`
    case 'year':
      return year
    case 'day':
      return `${Number(date.slice(8, 10))} de ${monthName(month)} de ${year}`
    case 'schedule':
      return spanTitle(month, addMonths(month, SCHEDULE_MONTHS - 1))
    case 'week':
    case 'four_days': {
      const days = columnDays(view, date)
      return spanTitle((days[0] ?? date).slice(0, 7), (days.at(-1) ?? date).slice(0, 7))
    }
  }
}

function spanTitle(from: Month, to: Month): string {
  if (from === to) return `${capitalize(monthName(from))} de ${from.slice(0, 4)}`
  if (from.slice(0, 4) === to.slice(0, 4)) {
    return `${capitalize(shortMonth(from))} – ${shortMonth(to)} de ${to.slice(0, 4)}`
  }
  return `${capitalize(shortMonth(from))} de ${from.slice(0, 4)} – ${shortMonth(to)} de ${to.slice(0, 4)}`
}

/** One day of a view: what lands on it and the balance at its end. */
export type DayCell = {
  date: string
  landings: Landing[]
  /** Skipped occurrences that would land on this day ("ignorados"); they never count. */
  skipped: Landing[]
  /**
   * Balance of the selected accounts at the end of the day; null when its
   * month was not loaded or the balance is not known yet on it.
   */
  endBalanceCents: number | null
}

export type SkipSource = {
  entries: readonly Entry[]
  parts: readonly EntryPart[]
  overrides: readonly EntryOverride[]
  /** Skipped occurrences of archived accounts are hidden too; omitted = none archived. */
  accounts?: readonly Pick<Account, 'id' | 'archived'>[]
}

/**
 * First day the balance of the accounts `ids` (null = every account) is known:
 * the day of their first counted movement in `results`, never after `today`
 * (an account with only an opening balance is known from today). Before it,
 * the balance would be an extrapolation of today's back past any history
 * (e.g. before the bank feed starts), not a real balance.
 */
export function balanceKnownFrom(
  results: readonly MonthResult[],
  ids: readonly string[] | null,
  today: string,
): string {
  for (const result of [...results].sort((a, b) => a.month.localeCompare(b.month))) {
    const days = result.landings.filter((l) => entryMatchesAccounts(l.entry, ids)).map((l) => l.day)
    if (days.length === 0) continue
    const date = `${result.month}-${String(Math.min(...days)).padStart(2, '0')}`
    return date < today ? date : today
  }
  return today
}

/**
 * Every day of the projected months, keyed by date, for the accounts `ids`
 * (null = every account). Days outside them are missing (see {@link cellOf}).
 * Days before `knownFrom` (see {@link balanceKnownFrom}) have no balance.
 */
export function dayCells(
  results: readonly MonthResult[],
  ids: readonly string[] | null,
  source: SkipSource,
  knownFrom: string | null = null,
): Map<string, DayCell> {
  const cells = new Map<string, DayCell>()
  const active = archivedFilter(source.accounts ?? [])
  for (const result of results) {
    const grid = calendarMonth(result, ids)
    for (const day of grid.days) {
      const date = `${result.month}-${String(day.day).padStart(2, '0')}`
      cells.set(date, {
        date,
        landings: day.landings,
        skipped: [],
        endBalanceCents: knownFrom !== null && date < knownFrom ? null : day.endBalanceCents,
      })
    }
    for (const entry of source.entries) {
      if (!active(entry) || !entryMatchesAccounts(entry, ids)) continue
      for (const landing of skippedLandingsIn(
        entry,
        source.parts,
        source.overrides,
        result.month,
      )) {
        const date = `${result.month}-${String(landing.day).padStart(2, '0')}`
        cells.get(date)?.skipped.push(landing)
      }
    }
  }
  return cells
}

/** The cell of `date`, or an empty one when its month was not loaded. */
export function cellOf(cells: ReadonlyMap<string, DayCell>, date: string): DayCell {
  return cells.get(date) ?? { date, landings: [], skipped: [], endBalanceCents: null }
}

/** A whole occurrence dragged to another day, shown there until the server confirms. */
export type DateMove = { entryId: string; competence: Month; date: string }

/**
 * The cells with pending `moves` applied: each moved whole occurrence leaves
 * its day for the new one (only movable landings, see `isMovable`).
 */
export function withDateMoves(
  cells: ReadonlyMap<string, DayCell>,
  moves: readonly DateMove[],
): ReadonlyMap<string, DayCell> {
  if (moves.length === 0) return cells
  const next = new Map<string, DayCell>()
  const moved: { landing: Landing; date: string }[] = []
  for (const [date, cell] of cells) {
    const landings = cell.landings.filter((landing) => {
      const move =
        landing.part === null
          ? moves.findLast(
              (m) => m.entryId === landing.entry.id && m.competence === landing.competence,
            )
          : undefined
      if (move === undefined || move.date === date) return true
      moved.push({ landing: { ...landing, day: Number(move.date.slice(8, 10)) }, date: move.date })
      return false
    })
    next.set(date, { ...cell, landings })
  }
  for (const { landing, date } of moved) {
    const cell = next.get(date)
    if (cell !== undefined) next.set(date, { ...cell, landings: [...cell.landings, landing] })
  }
  return next
}
