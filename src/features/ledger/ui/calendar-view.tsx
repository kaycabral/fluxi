'use client'

import { saveCalendarPrefsAction } from '@/features/ledger/adapters/actions/calendar-prefs'
import { changeDayAction } from '@/features/ledger/adapters/actions/entries'
import { decisionAccountIds } from '@/features/ledger/core/account-filter'
import type { CalendarPrefs } from '@/features/ledger/core/calendar-prefs'
import {
  CALENDAR_VIEWS,
  dayCells,
  shiftDate,
  VIEW_LABELS,
  VIEW_SHORTCUTS,
  viewMonths,
  viewTitle,
  withDateMoves,
  type CalendarViewMode,
  type DateMove,
} from '@/features/ledger/core/calendar-views'
import { describeOccurrenceChange } from '@/features/ledger/core/entry-form'
import type { Landing } from '@/features/ledger/core/occurrence'
import type { EditScope } from '@/features/ledger/core/scoped-edit'
import { projectWindow, targetFor, type LedgerData } from '@/features/ledger/core/view'
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@cbrl/design'
import { ChevronDown, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useOptimistic, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  CALENDAR_TODAY_EVENT,
  calendarHref,
  CalendarProvider,
  type CalendarContextValue,
} from './calendar/context'
import { DayColumns } from './calendar/day-columns'
import { MonthGrid } from './calendar/month-grid'
import { ScheduleList } from './calendar/schedule-list'
import { YearGrid } from './calendar/year-grid'
import { useLedgerUi } from './ledger-shell'

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)
}

/** Views where a day is a box the quick add can anchor to. */
const QUICK_ADD_VIEWS: readonly CalendarViewMode[] = ['month', 'week', 'day', 'four_days']

/**
 * "Calendário", the main view, laid out like Google Calendar: a toolbar (Hoje,
 * ‹ ›, title, view menu) over the chosen view. Day, week, month, year,
 * schedule and 4 days; weekends, paid and ignored entries can be hidden or
 * shown. The balance shown is the end-of-day balance of the chosen accounts
 * (by default every account).
 */
export function CalendarView({
  data,
  view,
  date,
  account,
  today,
  prefs: initialPrefs,
}: {
  data: LedgerData
  view: CalendarViewMode
  /** `YYYY-MM-DD` the view shows. */
  date: string
  account: string
  /** `YYYY-MM-DD`. */
  today: string
  prefs: CalendarPrefs
}) {
  const router = useRouter()
  const { openNew, requestScope, offerUndo } = useLedgerUi()
  const [prefs, setPrefs] = useState(initialPrefs)
  const [quickDate, setQuickDate] = useState<string | null>(null)
  const [dragged, setDragged] = useState<Landing | null>(null)
  const [moves, addMove] = useOptimistic<DateMove[], DateMove>([], (current, move) => [
    ...current,
    move,
  ])
  const [, startTransition] = useTransition()

  const projected = useMemo(() => {
    const { from, to } = viewMonths(view, date)
    return dayCells(projectWindow(data, from, to), decisionAccountIds(account, data.accounts), data)
  }, [data, view, date, account])
  const cells = useMemo(() => withDateMoves(projected, moves), [projected, moves])

  function savePrefs(next: CalendarPrefs) {
    setPrefs(next)
    startTransition(async () => {
      await saveCalendarPrefsAction(next)
    })
  }

  function go(nextView: CalendarViewMode, nextDate: string | null) {
    setQuickDate(null)
    if (nextView !== prefs.view) savePrefs({ ...prefs, view: nextView })
    router.push(calendarHref(nextView, nextDate, account), { scroll: false })
  }

  async function moveTo(landing: Landing, target: string) {
    const day = Number(target.slice(8, 10))
    if (target.slice(0, 7) !== landing.month || day === landing.day) return
    // Ask before the transition: updates inside an async transition commit only when it ends.
    let scope: EditScope | null = null
    if (landing.entry.recurrence !== 'none') {
      scope = await requestScope({
        kind: 'edit',
        description: describeOccurrenceChange(targetFor(data, landing), landing.competence, {
          day,
        }),
      })
      if (scope === null) return
    }
    startTransition(async () => {
      addMove({ entryId: landing.entry.id, competence: landing.competence, date: target })
      const result = await changeDayAction({
        entryId: landing.entry.id,
        month: landing.competence,
        day,
        scope,
      })
      if (!result.ok) toast.error(result.error)
      else offerUndo(result, 'Transação movida.')
    })
  }

  function openQuick(day: string | null) {
    if (day !== null && !QUICK_ADD_VIEWS.includes(view)) {
      openNew({ date: day })
      return
    }
    setQuickDate(day)
  }

  // Google Calendar's shortcuts: D W M Y A X switch views, T goes to today, J/K move.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.defaultPrevented) return
      if (
        isTyping(event.target) ||
        document.querySelector('[role="dialog"][data-state="open"]') !== null
      )
        return
      const key = event.key.toUpperCase()
      const target = CALENDAR_VIEWS.find((v) => VIEW_SHORTCUTS[v] === key)
      if (target !== undefined) go(target, date)
      else if (key === 'T') {
        go(view, null)
        window.dispatchEvent(new Event(CALENDAR_TODAY_EVENT))
      } else if (key === 'J') go(view, shiftDate(view, date, 1))
      else if (key === 'K') go(view, shiftDate(view, date, -1))
      else return
      event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const value: CalendarContextValue = {
    data,
    view,
    date,
    account,
    today,
    prefs,
    cells,
    quickDate,
    openQuick,
    dragged,
    setDragged,
    moveTo: (landing, target) => void moveTo(landing, target),
  }

  return (
    <CalendarProvider value={value}>
      <section
        aria-labelledby="calendar-title"
        className="flex h-[calc(100svh-3.5rem)] min-h-[32rem] flex-col"
      >
        <header className="flex flex-wrap items-center gap-2 px-3 py-2 md:px-4">
          <Button variant="outline" className="rounded-full px-5" asChild>
            <Link
              href={calendarHref(view, null, account)}
              aria-keyshortcuts="T"
              onClick={() => window.dispatchEvent(new Event(CALENDAR_TODAY_EVENT))}
            >
              Hoje
            </Link>
          </Button>
          <div className="flex items-center">
            <Button variant="ghost" size="icon-sm" className="rounded-full" asChild>
              <Link
                href={calendarHref(view, shiftDate(view, date, -1), account)}
                aria-label="Anterior"
                aria-keyshortcuts="K"
              >
                <ChevronLeft />
              </Link>
            </Button>
            <Button variant="ghost" size="icon-sm" className="rounded-full" asChild>
              <Link
                href={calendarHref(view, shiftDate(view, date, 1), account)}
                aria-label="Próximo"
                aria-keyshortcuts="J"
              >
                <ChevronRight />
              </Link>
            </Button>
          </div>
          <h1 id="calendar-title" className="text-xl font-normal md:text-2xl">
            {viewTitle(view, date)}
          </h1>
          <div className="ml-auto flex items-center gap-2">
            <Button onClick={() => openNew()} aria-keyshortcuts="N">
              <Plus /> Nova transação
            </Button>
            <ViewMenu
              view={view}
              prefs={prefs}
              onView={(next) => go(next, date)}
              onPrefs={savePrefs}
            />
          </div>
        </header>
        <div className="bg-card mx-1 mb-1 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border md:mx-3 md:mb-3">
          {view === 'month' && <MonthGrid />}
          {(view === 'week' || view === 'day' || view === 'four_days') && (
            <DayColumns view={view} />
          )}
          {view === 'year' && <YearGrid />}
          {view === 'schedule' && <ScheduleList />}
        </div>
      </section>
    </CalendarProvider>
  )
}

/** Google Calendar's view menu: the views with their shortcuts, then the "Mostrar …" switches. */
function ViewMenu({
  view,
  prefs,
  onView,
  onPrefs,
}: {
  view: CalendarViewMode
  prefs: CalendarPrefs
  onView: (view: CalendarViewMode) => void
  onPrefs: (prefs: CalendarPrefs) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="rounded-full"
          aria-label={`Visualização: ${VIEW_LABELS[view]}`}
        >
          {VIEW_LABELS[view]} <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {CALENDAR_VIEWS.map((option) => (
          <DropdownMenuItem key={option} onSelect={() => onView(option)}>
            {VIEW_LABELS[option]}
            <DropdownMenuShortcut>{VIEW_SHORTCUTS[option]}</DropdownMenuShortcut>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={prefs.weekends}
          onCheckedChange={(checked) => onPrefs({ ...prefs, weekends: checked === true })}
        >
          Mostrar fins de semana
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={prefs.paid}
          onCheckedChange={(checked) => onPrefs({ ...prefs, paid: checked === true })}
        >
          Mostrar pagos e recebidos
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={prefs.skipped}
          onCheckedChange={(checked) => onPrefs({ ...prefs, skipped: checked === true })}
        >
          Mostrar ignorados
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
