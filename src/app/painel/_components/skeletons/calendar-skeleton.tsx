'use client'

import {
  LoadingStatus,
  SKELETON_ROOT,
  TextSkeleton,
  VisualText,
} from '@/app/painel/_components/skeletons/parts'
import {
  CALENDAR_VIEWS,
  MONTH_NAMES,
  VIEW_LABELS,
  WEEKDAY_INITIALS,
  WEEKDAY_SHORT,
  type CalendarViewMode,
} from '@/features/ledger/core/calendar-views'
import { centeredScrollTop } from '@/features/ledger/ui/calendar/skeleton-state'
import { Button, cn, Skeleton } from '@cbrl/design'
import { ChevronDown, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'

/*
 * The calendar's loading skeleton. The view (and weekends, and the month's
 * weeks) come from `<html data-cal-*>`, set before the first paint by the
 * shell's script and kept current by the calendar (`skeleton-state`), so the
 * skeleton draws every view and CSS keeps the right one: nothing swaps after
 * the first paint. Literal classes for Tailwind.
 */

/** Shows a block only in its view. */
const IN_VIEW: Record<CalendarViewMode, string> = {
  month: 'hidden [html[data-cal-view=month]_&]:flex',
  week: 'hidden [html[data-cal-view=week]_&]:flex',
  four_days: 'hidden [html[data-cal-view=four-days]_&]:flex',
  day: 'hidden [html[data-cal-view=day]_&]:flex',
  year: 'hidden [html[data-cal-view=year]_&]:grid',
  schedule: 'hidden [html[data-cal-view=schedule]_&]:block',
}

/** The view menu's label of each view. */
const LABEL_IN_VIEW: Record<CalendarViewMode, string> = {
  month: 'hidden [html[data-cal-view=month]_&]:inline',
  week: 'hidden [html[data-cal-view=week]_&]:inline',
  four_days: 'hidden [html[data-cal-view=four-days]_&]:inline',
  day: 'hidden [html[data-cal-view=day]_&]:inline',
  year: 'hidden [html[data-cal-view=year]_&]:inline',
  schedule: 'hidden [html[data-cal-view=schedule]_&]:inline',
}

/** Weekend columns (Sunday, Saturday) drop when the prefs hide weekends. */
const WEEKEND = '[html[data-cal-weekends=off]_&]:hidden'
const SEVEN_OR_FIVE = 'grid-cols-7 [html[data-cal-weekends=off]_&]:grid-cols-5'

/** The month grid has the month's 4, 5 or 6 weeks. */
const MONTH_ROWS =
  'grid-rows-[repeat(5,minmax(5.5rem,1fr))] [html[data-cal-weeks="4"]_&]:grid-rows-[repeat(4,minmax(5.5rem,1fr))] [html[data-cal-weeks="6"]_&]:grid-rows-[repeat(6,minmax(5.5rem,1fr))]'
const FIFTH_WEEK = '[html[data-cal-weeks="4"]_&]:hidden'
const SIXTH_WEEK = 'hidden [html[data-cal-weeks="6"]_&]:flex'

const isWeekend = (column: number) => column === 0 || column === 6

/** `MonthGrid` loading. */
function MonthSkeleton() {
  return (
    <div className={cn('min-h-0 flex-1 flex-col', IN_VIEW.month)}>
      <div className={cn('grid border-b', SEVEN_OR_FIVE)}>
        {WEEKDAY_SHORT.map((label, column) => (
          <div
            key={label}
            className={cn(
              'text-muted-foreground py-1 text-center text-[0.7rem] font-medium',
              isWeekend(column) && WEEKEND,
            )}
          >
            <VisualText text={label} />
          </div>
        ))}
      </div>
      <div className={cn('grid min-h-0 flex-1', SEVEN_OR_FIVE, MONTH_ROWS)}>
        {Array.from({ length: 42 }, (_, i) => {
          const week = Math.floor(i / 7)
          return (
            <div
              key={i}
              className={cn(
                'flex min-h-0 min-w-0 flex-col gap-0.5 overflow-hidden border-r border-b p-1',
                isWeekend(i % 7) && WEEKEND,
                week === 4 && FIFTH_WEEK,
                week === 5 && SIXTH_WEEK,
              )}
            >
              <div className="flex h-6 shrink-0 items-center justify-between gap-1">
                <Skeleton className="size-6 rounded-full" />
                <Skeleton className="hidden h-3 w-14 sm:block" />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Columns of the day views (a week drops its weekend with the prefs). */
const COLUMN_CLASSES = {
  week: SEVEN_OR_FIVE,
  four_days: 'grid-cols-4',
  day: 'grid-cols-1',
} as const

/** `DayColumns` loading: `count` columns (a week drops its weekend with the prefs). */
function ColumnsSkeleton({ view, count }: { view: 'week' | 'four_days' | 'day'; count: number }) {
  const columns = COLUMN_CLASSES[view]
  const weekendAware = (column: number) => view === 'week' && isWeekend(column) && WEEKEND
  return (
    <div className={cn('min-h-0 flex-1 flex-col', IN_VIEW[view])}>
      <div className={cn('grid border-b', columns)}>
        {Array.from({ length: count }, (_, column) => (
          <div
            key={column}
            className={cn('grid justify-items-center gap-0.5 py-2', weekendAware(column))}
          >
            <span className="text-muted-foreground text-[0.7rem] font-medium">
              {view === 'week' ? (
                <VisualText text={WEEKDAY_SHORT[column] ?? ''} />
              ) : (
                <TextSkeleton sample="SEG." />
              )}
            </span>
            <Skeleton className="size-11 rounded-full" />
            <span className="h-4 text-[0.7rem]">
              <TextSkeleton sample="000.000,00" />
            </span>
          </div>
        ))}
      </div>
      <div className={cn('grid min-h-0 flex-1', columns)}>
        {Array.from({ length: count }, (_, column) => (
          <div key={column} className={cn('min-h-full border-r p-1', weekendAware(column))} />
        ))}
      </div>
    </div>
  )
}

/** `YearGrid` loading: the twelve mini months, always six weeks, scrolled like the year view. */
function YearSkeleton() {
  const scroller = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const root = scroller.current
    const month = document.documentElement.dataset.calMonth
    const section = root?.querySelector<HTMLElement>(`[data-month-index="${month ?? ''}"]`)
    if (root && section) root.scrollTop = centeredScrollTop(root, section)
  }, [])
  return (
    <div
      ref={scroller}
      className={cn(
        'relative content-start gap-x-8 gap-y-6 overflow-y-auto p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
        IN_VIEW.year,
      )}
    >
      {MONTH_NAMES.map((name, index) => (
        <section key={name} data-month-index={index + 1} className="grid gap-1">
          <div className="flex items-baseline justify-between gap-2 px-1">
            <h2 className="text-sm font-medium">
              <VisualText text={name} />
            </h2>
            <span className="text-xs">
              <TextSkeleton sample="000.000,00" />
            </span>
          </div>
          <div className="grid grid-cols-7 text-center text-[0.7rem]">
            {WEEKDAY_INITIALS.map((initial, i) => (
              <span key={`${initial}-${i}`} className="text-muted-foreground py-1">
                <VisualText text={initial} />
              </span>
            ))}
            {Array.from({ length: 42 }, (_, i) => (
              <Skeleton key={i} className="mx-auto size-7 rounded-full" />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

/** `ScheduleList` loading: a column of days with their entries. */
function ScheduleSkeleton() {
  return (
    <div className={cn('min-h-0 flex-1 overflow-y-auto', IN_VIEW.schedule)}>
      <ol className="divide-y">
        {Array.from({ length: 12 }, (_, i) => (
          <li
            key={i}
            className="grid grid-cols-[5.5rem_1fr] gap-2 px-3 py-2 sm:grid-cols-[7rem_1fr]"
          >
            <div className="flex items-baseline gap-2 pt-1">
              <Skeleton className="size-8 rounded-full" />
              <span className="text-[0.65rem] font-medium">
                <TextSkeleton sample="nov., SEG." />
              </span>
            </div>
            <div className="grid min-w-0 gap-0.5">
              <Skeleton className="h-5 w-2/3" />
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** `/painel/calendario` loading: the toolbar and the grid of the current view, blank. */
export function CalendarSkeleton() {
  return (
    <>
      <LoadingStatus />
      <section
        {...SKELETON_ROOT}
        data-fills-viewport=""
        className="flex h-[calc(100svh-3.5rem)] flex-col md:h-svh"
      >
        <header className="flex min-h-16 flex-wrap items-center gap-x-2 gap-y-2 px-3 py-2 md:px-4">
          <Button variant="outline" size="lg" disabled tabIndex={-1}>
            <VisualText text="Hoje" />
          </Button>
          <div className="flex items-center">
            <Button variant="ghost" size="icon-lg" disabled tabIndex={-1}>
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon-lg" disabled tabIndex={-1}>
              <ChevronRight />
            </Button>
          </div>
          <h1 className="ml-1 text-lg font-normal md:text-[22px] md:leading-7">
            <TextSkeleton sample="Novembro de 2026" />
          </h1>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" size="lg" disabled tabIndex={-1}>
              {CALENDAR_VIEWS.map((view) => (
                <span key={view} className={LABEL_IN_VIEW[view]}>
                  <VisualText text={VIEW_LABELS[view]} />
                </span>
              ))}
              <ChevronDown />
            </Button>
            <Button size="lg" disabled tabIndex={-1}>
              <Plus /> <VisualText text="Nova transação" />
            </Button>
          </div>
        </header>
        <div className="bg-card mx-1 mb-1 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border md:mx-3 md:mb-3">
          <MonthSkeleton />
          <ColumnsSkeleton view="week" count={7} />
          <ColumnsSkeleton view="four_days" count={4} />
          <ColumnsSkeleton view="day" count={1} />
          <YearSkeleton />
          <ScheduleSkeleton />
        </div>
      </section>
    </>
  )
}
