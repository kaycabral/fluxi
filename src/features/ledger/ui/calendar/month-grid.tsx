'use client'

import {
  cellOf,
  isWeekend,
  monthWeeks,
  shiftDate,
  weekdayOf,
} from '@/features/ledger/core/calendar-views'
import { dayLongLabel } from '@/features/ledger/core/format'
import { paymentFor } from '@/features/ledger/core/payments'
import { formatAmountFromCents } from '@cbrl/br/money'
import { cn, Popover, PopoverContent, PopoverTrigger } from '@cbrl/design'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { QuickAddForm } from '../quick-add'
import {
  calendarHref,
  POPUP_CLASS,
  POPUP_PLACEMENT,
  useCalendar,
  usePopupSide,
  visibleLandings,
} from './context'
import { DayPanel, WEEKDAY_SHORT } from './day-panel'
import { EventChip } from './event-chip'

/** Chip height + gap, and the day header row (px): how many chips fit in a day. */
const CHIP_PX = 22
const HEADER_PX = 30

const MONTHS_SHORT = [
  'jan.',
  'fev.',
  'mar.',
  'abr.',
  'mai.',
  'jun.',
  'jul.',
  'ago.',
  'set.',
  'out.',
  'nov.',
  'dez.',
]

/** "1 nov." on the 1st of a month (like Google Calendar), else the day number. */
function dayNumberLabel(date: string): string {
  const day = Number(date.slice(8, 10))
  return day === 1 ? `1 ${MONTHS_SHORT[Number(date.slice(5, 7)) - 1] ?? ''}` : String(day)
}

/**
 * How many chips fit in a day of `rowPx` height (at least one line). Until the
 * grid is measured (and in jsdom) everything shows.
 */
export function chipCapacity(rowPx: number | null): number {
  if (rowPx === null || rowPx <= 0) return Number.POSITIVE_INFINITY
  return Math.max(1, Math.floor((rowPx - HEADER_PX) / CHIP_PX))
}

/**
 * Month view: the full weeks covering the month, every day the same size and
 * the grid filling the screen. A day shows the chips that fit and "Mais N" for
 * the rest; the mouse wheel moves to the previous/next month.
 */
export function MonthGrid() {
  const { date, account, prefs, today } = useCalendar()
  const router = useRouter()
  const month = date.slice(0, 7)
  const weeks = monthWeeks(month).map((week) =>
    prefs.weekends ? week : week.filter((day) => !isWeekend(day)),
  )
  const columns = weeks[0]?.length ?? 7

  const bodyRef = useRef<HTMLDivElement>(null)
  const [rowPx, setRowPx] = useState<number | null>(null)
  useEffect(() => {
    const body = bodyRef.current
    if (body === null) return
    const measure = () => setRowPx(body.clientHeight / Math.max(1, weeks.length))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(body)
    return () => observer.disconnect()
  }, [weeks.length])
  const capacity = chipCapacity(rowPx)

  // Wheel: one month per gesture (a trackpad fires many small events).
  const wheel = useRef({ delta: 0, lockedUntil: 0 })
  function onWheel(event: React.WheelEvent) {
    // React bubbles synthetic events through portals, so a wheel inside a
    // popup or its select list would otherwise change the month (and close the
    // popup). Only the grid's own DOM turns the page.
    if (!(event.target instanceof Node) || !event.currentTarget.contains(event.target)) return
    const state = wheel.current
    const now = event.timeStamp
    if (now < state.lockedUntil) return
    state.delta += event.deltaY
    if (Math.abs(state.delta) < 40) return
    const step = state.delta > 0 ? 1 : -1
    state.delta = 0
    state.lockedUntil = now + 450
    router.push(calendarHref('month', shiftDate('month', date, step), account), { scroll: false })
  }

  const weekdayLabels = (weeks[0] ?? []).map((day) => WEEKDAY_SHORT[weekdayOf(day)])

  return (
    <div className="flex min-h-0 flex-1 flex-col" onWheel={onWheel}>
      <div
        className="grid border-b"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {weekdayLabels.map((label) => (
          <div
            key={label}
            className="text-muted-foreground py-1 text-center text-[0.7rem] font-medium"
          >
            {label}
          </div>
        ))}
      </div>
      <div
        ref={bodyRef}
        className="grid min-h-0 flex-1"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${weeks.length}, minmax(5.5rem, 1fr))`,
        }}
      >
        {weeks.flat().map((day) => (
          <MonthDay
            key={day}
            date={day}
            inMonth={day.startsWith(month)}
            capacity={capacity}
            today={today}
          />
        ))}
      </div>
    </div>
  )
}

function MonthDay({
  date,
  inMonth,
  capacity,
  today,
}: {
  date: string
  inMonth: boolean
  capacity: number
  today: string
}) {
  const { cells, prefs, data, quickDate, openQuick, dragged, setDragged, moveTo } = useCalendar()
  const [over, setOver] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const cell = cellOf(cells, date)
  const items = visibleLandings(cell, prefs, (l) => paymentFor(l, data.payments) !== undefined)
  const quick = quickDate === date
  const [side, measureSide] = usePopupSide()
  // The placeholder chip of the quick add takes a line too.
  const lines = items.length + (quick ? 1 : 0)
  const shown = lines > capacity ? Math.max(0, capacity - 1 - (quick ? 1 : 0)) : items.length
  const hidden = items.length - shown
  const negative = cell.endBalanceCents !== null && cell.endBalanceCents < 0
  const isToday = date === today
  // Moves stay inside the occurrence's month (the server keeps its competence).
  const canDrop = dragged !== null && dragged.month === date.slice(0, 7)

  return (
    <div
      role="group"
      aria-label={
        negative ? `Dia ${dayLongLabel(date)}, saldo negativo` : `Dia ${dayLongLabel(date)}`
      }
      onDragOver={(e) => {
        if (!canDrop) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        const landing = dragged
        setDragged(null)
        if (landing !== null && canDrop) moveTo(landing, date)
      }}
      className={cn(
        'relative flex min-h-0 min-w-0 flex-col gap-0.5 overflow-hidden border-r border-b p-1',
        negative && 'bg-destructive/5',
        over && 'bg-primary/10 ring-primary ring-2 ring-inset',
      )}
    >
      <Popover open={quick} onOpenChange={(open) => openQuick(open ? date : null)}>
        <PopoverTrigger asChild>
          {/* Covers the whole day: a click on any empty spot creates there. */}
          <button
            type="button"
            onClick={(e) => measureSide(e.currentTarget)}
            aria-label={`Criar transação em ${dayLongLabel(date)}`}
            aria-current={isToday ? 'date' : undefined}
            className="group/day focus-visible:ring-ring absolute inset-0 flex cursor-pointer items-start justify-start p-1 outline-none focus-visible:ring-2 focus-visible:ring-inset"
          >
            <span
              className={cn(
                'grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs font-medium',
                inMonth ? 'text-foreground' : 'text-muted-foreground',
                'group-hover/day:bg-muted',
                isToday && 'bg-primary text-primary-foreground group-hover/day:bg-primary/90',
              )}
            >
              {dayNumberLabel(date)}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          side={side}
          align="start"
          {...POPUP_PLACEMENT}
          className={cn('w-[min(26rem,calc(100vw-2rem))]', POPUP_CLASS)}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            document.getElementById('quick-description')?.focus()
          }}
        >
          <QuickAddForm date={date} onDone={() => openQuick(null)} />
        </PopoverContent>
      </Popover>
      {/* First row: room for the day number (drawn by the button), the end balance on the right
          (from `sm` up: a phone's cell has no room for it, and a cut value would mislead; the
          day's panel still shows it). */}
      <div className="pointer-events-none relative flex h-6 shrink-0 items-center justify-end pl-10">
        <span
          className={cn(
            'text-muted-foreground hidden truncate text-[0.7rem] tabular-nums sm:inline',
            negative && 'text-destructive font-medium',
          )}
        >
          {cell.endBalanceCents === null ? '' : formatAmountFromCents(cell.endBalanceCents)}
        </span>
      </div>
      {/* Above the button; only the chips take clicks. */}
      <div className="pointer-events-none relative grid min-w-0 gap-0.5 *:pointer-events-auto">
        {items.slice(0, shown).map(({ landing, skipped }, index) => (
          <EventChip
            key={`${landing.entry.id}-${landing.part?.id ?? 'whole'}-${String(skipped)}-${index}`}
            landing={landing}
            skipped={skipped}
          />
        ))}
        {quick && (
          <span className="bg-primary text-primary-foreground h-5 truncate rounded px-1.5 text-xs leading-5">
            (Sem descrição)
          </span>
        )}
        {hidden > 0 && (
          <Popover open={moreOpen} onOpenChange={setMoreOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="hover:bg-muted h-5 rounded px-1.5 text-left text-xs font-medium"
              >
                Mais {hidden}
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="center"
              {...POPUP_PLACEMENT}
              className={cn('w-64 p-2', POPUP_CLASS)}
              // "Criar neste dia" opens the quick add: giving focus back to "Mais N" would close it.
              onCloseAutoFocus={(event) => event.preventDefault()}
            >
              <DayPanel date={date} onClose={() => setMoreOpen(false)} />
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  )
}
