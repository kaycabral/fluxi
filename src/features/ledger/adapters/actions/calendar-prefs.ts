'use server'

import {
  CALENDAR_PREFS_COOKIE,
  calendarPrefsSchema,
  type CalendarPrefs,
} from '@/features/ledger/core/calendar-prefs'
import { cookies } from 'next/headers'

/**
 * Remember the calendar's view preferences (a cookie, so the server renders
 * the last view). Not personal data: only view flags, validated here.
 */
export async function saveCalendarPrefsAction(input: unknown): Promise<CalendarPrefs | null> {
  const parsed = calendarPrefsSchema.safeParse(input)
  if (!parsed.success) return null
  const store = await cookies()
  store.set(CALENDAR_PREFS_COOKIE, JSON.stringify(parsed.data), {
    path: '/painel',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    // Readable by the page: the loading shell's inline script draws the
    // skeleton of this view before the first paint (only view flags).
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
  })
  return parsed.data
}
