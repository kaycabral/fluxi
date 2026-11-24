'use client'

import {
  addDays,
  cellOf,
  shiftDate,
  viewMonths,
  weekdayOf,
} from '@/features/ledger/core/calendar-views'
import { daysInMonth } from '@/features/ledger/core/month'
import { paymentFor } from '@/features/ledger/core/payments'
import { cn } from '@cbrl/design'
import Link from 'next/link'
import { calendarHref, useCalendar, visibleLandings } from './context'
import { EventChip } from './event-chip'

const MONTHS_SHORT = [
  'JAN.',
  'FEV.',
  'MAR.',
  'ABR.',
  'MAIO',
  'JUN.',
  'JUL.',
  'AGO.',
  'SET.',
  'OUT.',
  'NOV.',
  'DEZ.',
]
const WEEKDAYS_SHORT = ['DOM.', 'SEG.', 'TER.', 'QUA.', 'QUI.', 'SEX.', 'SÁB.']
const MONTHS_LONG = [
  'jan.',
  'fev.',
  'mar.',
  'abr.',
  'maio',
  'jun.',
  'jul.',
  'ago.',
  'set.',
  'out.',
  'nov.',
  'dez.',
]

/**
 * "Programação": one row per day that has something, from the chosen date
 * to the end of the loaded window; past days are faded, like Google Calendar.
 */
export function ScheduleList() {
  const { date, account, cells, prefs, data, today } = useCalendar()
  const { to } = viewMonths('schedule', date)
  const last = `${to}-${String(daysInMonth(to)).padStart(2, '0')}`
  const days: string[] = []
  for (let day = date; day <= last; day = addDays(day, 1)) days.push(day)
  const rows = days
    .map((day) => ({
      day,
      items: visibleLandings(
        cellOf(cells, day),
        prefs,
        (l) => paymentFor(l, data.payments) !== undefined,
      ),
    }))
    .filter((row) => row.items.length > 0)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <ol className="divide-y">
        {rows.map(({ day, items }) => (
          <li
            key={day}
            className={cn(
              'grid grid-cols-[5.5rem_1fr] gap-2 px-3 py-2 sm:grid-cols-[7rem_1fr]',
              day < today && 'opacity-60',
            )}
          >
            <div className="flex items-baseline gap-2 pt-1">
              <span
                className={cn(
                  'grid size-8 place-items-center rounded-full text-xl',
                  day === today && 'bg-primary text-primary-foreground',
                )}
              >
                {Number(day.slice(8, 10))}
              </span>
              <span className="text-muted-foreground text-[0.65rem] font-medium">
                {MONTHS_SHORT[Number(day.slice(5, 7)) - 1]}, {WEEKDAYS_SHORT[weekdayOf(day)]}
              </span>
            </div>
            <div className="grid min-w-0 gap-0.5">
              {items.map(({ landing, skipped }, index) => (
                <EventChip
                  key={`${landing.entry.id}-${landing.part?.id ?? 'whole'}-${String(skipped)}-${index}`}
                  landing={landing}
                  skipped={skipped}
                  variant="row"
                />
              ))}
            </div>
          </li>
        ))}
      </ol>
      {rows.length === 0 && (
        <p className="text-muted-foreground p-6 text-center text-sm">
          Nenhum lançamento neste período.
        </p>
      )}
      <p className="text-muted-foreground px-3 py-4 text-sm">
        Mostrando lançamentos até {Number(last.slice(8, 10))}{' '}
        {MONTHS_LONG[Number(last.slice(5, 7)) - 1]} {last.slice(0, 4)}.{' '}
        <Link
          className="text-primary font-medium hover:underline"
          href={calendarHref('schedule', shiftDate('schedule', date, 1), account)}
        >
          Ver mais
        </Link>
      </p>
    </div>
  )
}
