'use client'

import { cellOf, columnDays, isWeekend, weekdayOf } from '@/features/ledger/core/calendar-views'
import { dayLongLabel, formatAmount } from '@/features/ledger/core/format'
import { paymentFor } from '@/features/ledger/core/payments'
import { cn, Popover, PopoverContent, PopoverTrigger } from '@cbrl/design'
import { useState } from 'react'
import { QuickAddForm } from '../quick-add'
import { POPUP_CLASS, POPUP_PLACEMENT, useCalendar, visibleLandings } from './context'
import { WEEKDAY_SHORT } from './day-panel'
import { EventChip } from './event-chip'

/**
 * Day, week and 4-day views. Entries have no time of day, so instead of
 * Google Calendar's hour grid each day is a column with all its entries (its
 * whole-day strip, never collapsed). Clicking an empty spot creates there.
 */
export function DayColumns({ view }: { view: 'day' | 'week' | 'four_days' }) {
  const { date, prefs } = useCalendar()
  const days = columnDays(view, date).filter(
    (day) => view !== 'week' || prefs.weekends || !isWeekend(day),
  )
  const template = { gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid border-b" style={template}>
        {days.map((day) => (
          <ColumnHeader key={day} date={day} />
        ))}
      </div>
      <div className="grid min-h-0 flex-1 overflow-y-auto" style={template}>
        {days.map((day) => (
          <Column key={day} date={day} />
        ))}
      </div>
    </div>
  )
}

function ColumnHeader({ date }: { date: string }) {
  const { cells, today } = useCalendar()
  const cell = cellOf(cells, date)
  const negative = cell.endBalanceCents !== null && cell.endBalanceCents < 0
  const isToday = date === today
  return (
    <div className="grid justify-items-center gap-0.5 py-2">
      <span
        className={cn(
          'text-[0.7rem] font-medium',
          isToday ? 'text-primary' : 'text-muted-foreground',
        )}
      >
        {WEEKDAY_SHORT[weekdayOf(date)]}
      </span>
      <span
        className={cn(
          'grid size-11 place-items-center rounded-full text-2xl',
          isToday && 'bg-primary text-primary-foreground',
        )}
        aria-current={isToday ? 'date' : undefined}
      >
        {Number(date.slice(8, 10))}
      </span>
      <span
        className={cn(
          'text-muted-foreground h-4 text-[0.7rem] tabular-nums',
          negative && 'text-destructive font-medium',
        )}
      >
        {cell.endBalanceCents === null ? '' : formatAmount(cell.endBalanceCents)}
      </span>
    </div>
  )
}

function Column({ date }: { date: string }) {
  const { cells, prefs, data, quickDate, openQuick, dragged, setDragged, moveTo } = useCalendar()
  const [over, setOver] = useState(false)
  const cell = cellOf(cells, date)
  const items = visibleLandings(cell, prefs, (l) => paymentFor(l, data.payments) !== undefined)
  const quick = quickDate === date
  const canDrop = dragged !== null && dragged.month === date.slice(0, 7)
  return (
    <div
      role="group"
      aria-label={`Dia ${dayLongLabel(date)}`}
      onDragOver={(e) => {
        if (!canDrop) return
        e.preventDefault()
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
      className={cn('relative min-h-full border-r p-1', over && 'bg-primary/10')}
    >
      <Popover open={quick} onOpenChange={(open) => openQuick(open ? date : null)}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Criar lançamento em ${dayLongLabel(date)}`}
            className="focus-visible:ring-ring absolute inset-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset"
          />
        </PopoverTrigger>
        <PopoverContent
          side="right"
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
      <div className="pointer-events-none relative grid gap-0.5 *:pointer-events-auto">
        {items.map(({ landing, skipped }, index) => (
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
      </div>
    </div>
  )
}
