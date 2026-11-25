'use client'

import { cellOf, monthDays, monthWeeks } from '@/features/ledger/core/calendar-views'
import { dayLongLabel, formatAmount } from '@/features/ledger/core/format'
import { cn, Popover, PopoverContent, PopoverTrigger } from '@cbrl/design'
import { useState } from 'react'
import { POPUP_CLASS, POPUP_PLACEMENT, useCalendar } from './context'
import { DayPanel } from './day-panel'

const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]
const WEEKDAY_INITIALS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

/**
 * Year view: twelve mini months (6 rows each, neighbour days muted, like
 * Google Calendar). A dot marks days with entries, red numbers the days that
 * end negative; clicking a day opens its list. Each month's header shows the
 * accumulated balance at the end of its last day.
 */
export function YearGrid() {
  const { date } = useCalendar()
  const year = date.slice(0, 4)
  return (
    <div className="grid content-start gap-x-8 gap-y-6 overflow-y-auto p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {MONTH_NAMES.map((name, index) => (
        <MiniMonth key={name} name={name} month={`${year}-${String(index + 1).padStart(2, '0')}`} />
      ))}
    </div>
  )
}

function MiniMonth({ name, month }: { name: string; month: string }) {
  const { cells } = useCalendar()
  // Accumulated balance at the end of the month's last day.
  const lastDay = monthDays(month).at(-1) ?? `${month}-01`
  const endBalance = cellOf(cells, lastDay).endBalanceCents
  const weeks = monthWeeks(month)
  // Always 6 rows, like Google Calendar, so the months line up.
  while (weeks.length < 6) {
    const last = weeks.at(-1)?.at(-1) ?? `${month}-01`
    const start = new Date(`${last}T00:00:00Z`)
    weeks.push(
      Array.from({ length: 7 }, (_, i) => {
        const day = new Date(start)
        day.setUTCDate(start.getUTCDate() + i + 1)
        return day.toISOString().slice(0, 10)
      }),
    )
  }
  return (
    <section aria-label={name} className="grid gap-1">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h2 className="text-sm font-medium">{name}</h2>
        {endBalance !== null && (
          <span
            aria-label={`Saldo no fim de ${name}`}
            className={cn(
              'text-muted-foreground text-xs tabular-nums',
              endBalance < 0 && 'text-destructive font-semibold',
            )}
          >
            {formatAmount(endBalance)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-7 text-center text-[0.7rem]">
        {WEEKDAY_INITIALS.map((initial, i) => (
          <span key={`${initial}-${i}`} className="text-muted-foreground py-1">
            {initial}
          </span>
        ))}
        {weeks.flat().map((day) => (
          <MiniDay key={day} date={day} inMonth={day.startsWith(month)} />
        ))}
      </div>
    </section>
  )
}

function MiniDay({ date, inMonth }: { date: string; inMonth: boolean }) {
  const { cells, today } = useCalendar()
  const [open, setOpen] = useState(false)
  const cell = cellOf(cells, date)
  const hasEntries = inMonth && cell.landings.length > 0
  const negative = inMonth && cell.endBalanceCents !== null && cell.endBalanceCents < 0
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={dayLongLabel(date)}
          aria-current={date === today ? 'date' : undefined}
          className={cn(
            'hover:bg-muted relative mx-auto grid size-7 place-items-center rounded-full',
            !inMonth && 'text-muted-foreground/60',
            negative && 'text-destructive font-semibold',
            date === today && 'bg-primary text-primary-foreground hover:bg-primary/90',
          )}
        >
          {Number(date.slice(8, 10))}
          {hasEntries && (
            <span className="bg-primary absolute bottom-0.5 size-1 rounded-full" aria-hidden />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent {...POPUP_PLACEMENT} className={cn('w-64 p-2', POPUP_CLASS)}>
        <DayPanel date={date} onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}
