'use client'

import type { CalendarPrefs } from '@/features/ledger/core/calendar-prefs'
import {
  VIEW_SLUGS,
  type CalendarViewMode,
  type DayCell,
} from '@/features/ledger/core/calendar-views'
import type { Landing } from '@/features/ledger/core/occurrence'
import type { LedgerData } from '@/features/ledger/core/view'
import { createContext, useContext } from 'react'

/** What every piece of the calendar reads: the data, the day cells and the shared actions. */
export type CalendarContextValue = {
  data: LedgerData
  view: CalendarViewMode
  date: string
  account: string
  today: string
  prefs: CalendarPrefs
  cells: ReadonlyMap<string, DayCell>
  /** The quick add is open on this day. */
  quickDate: string | null
  openQuick: (date: string | null) => void
  /** Drag an entry to another day. */
  dragged: Landing | null
  setDragged: (landing: Landing | null) => void
  moveTo: (landing: Landing, date: string) => void
}

const CalendarContext = createContext<CalendarContextValue | null>(null)

export const CalendarProvider = CalendarContext.Provider

export function useCalendar(): CalendarContextValue {
  const value = useContext(CalendarContext)
  if (value === null) throw new Error('useCalendar must be used inside <CalendarView>')
  return value
}

/** `/painel?modo=…&data=…&conta=…`; no `data` means today. */
export function calendarHref(view: CalendarViewMode, date: string | null, account: string) {
  const params = new URLSearchParams({ modo: VIEW_SLUGS[view] })
  if (date !== null) params.set('data', date)
  if (account !== '') params.set('conta', account)
  return `/painel?${params.toString()}` as const
}

/** The landings a day shows under the prefs: paid ones only when "Mostrar pagos" is on. */
export function visibleLandings(
  cell: DayCell,
  prefs: CalendarPrefs,
  isPaid: (landing: Landing) => boolean,
): { landing: Landing; skipped: boolean }[] {
  const shown = cell.landings
    .filter((landing) => prefs.paid || !isPaid(landing))
    .map((landing) => ({ landing, skipped: false }))
  if (!prefs.skipped) return shown
  return [...shown, ...cell.skipped.map((landing) => ({ landing, skipped: true }))]
}

/**
 * Placement of every calendar popup: kept fully on screen (12px from the
 * edges, sliding along the anchor as much as needed) and never taller than
 * the room left, scrolling inside instead.
 */
export const POPUP_PLACEMENT = {
  collisionPadding: 12,
  sticky: 'always',
} as const

/**
 * Look of every calendar popup: never taller than the room left (scrolling
 * inside) and lifted off the calendar like Google Calendar's, with a large
 * radius, no border and the deep `shadow-popup` elevation.
 */
export const POPUP_CLASS =
  'max-h-(--radix-popover-content-available-height) overflow-y-auto rounded-2xl border-0 shadow-popup'
