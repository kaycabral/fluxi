import { z } from 'zod'
import { CALENDAR_VIEWS, type CalendarViewMode } from './calendar-views'

/**
 * The calendar's view preferences (like Google Calendar's "Mostrar fins de
 * semana" and friends), kept in a cookie so the server renders the last view.
 */
export type CalendarPrefs = {
  /** The view `/painel` opens in when the URL names none. */
  view: CalendarViewMode
  weekends: boolean
  /** Show paid/received occurrences (faded); hidden ones still count in the balances. */
  paid: boolean
  /** Show the occurrences ignored ("pular este mês"); they never count. */
  skipped: boolean
}

export const CALENDAR_PREFS_COOKIE = 'fluxi_calendar'

export const DEFAULT_CALENDAR_PREFS: CalendarPrefs = {
  view: 'month',
  weekends: true,
  paid: true,
  skipped: false,
}

export const calendarPrefsSchema = z.object({
  view: z.enum(CALENDAR_VIEWS),
  weekends: z.boolean(),
  paid: z.boolean(),
  skipped: z.boolean(),
})

/** Prefs from the cookie value; defaults for anything missing or malformed. */
export function parseCalendarPrefs(raw: string | undefined): CalendarPrefs {
  if (raw === undefined) return DEFAULT_CALENDAR_PREFS
  try {
    const parsed = calendarPrefsSchema.partial().safeParse(JSON.parse(raw))
    return parsed.success ? { ...DEFAULT_CALENDAR_PREFS, ...parsed.data } : DEFAULT_CALENDAR_PREFS
  } catch {
    return DEFAULT_CALENDAR_PREFS
  }
}
