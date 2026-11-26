'use client'

import { cellOf, weekdayOf } from '@/features/ledger/core/calendar-views'
import { paymentFor } from '@/features/ledger/core/payments'
import { formatAmountFromCents } from '@cbrl/br/money'
import { Button, cn } from '@cbrl/design'
import { Plus, X } from 'lucide-react'
import { useCalendar, visibleLandings } from './context'
import { EventChip } from './event-chip'

export const WEEKDAY_SHORT = ['DOM.', 'SEG.', 'TER.', 'QUA.', 'QUI.', 'SEX.', 'SÁB.']

/**
 * Every occurrence of one day, in a popover (Google Calendar's "Mais N" card):
 * weekday, big day number, the balance at the end of the day and the full list.
 */
export function DayPanel({ date, onClose }: { date: string; onClose: () => void }) {
  const { cells, prefs, data, openQuick, today } = useCalendar()
  const cell = cellOf(cells, date)
  const items = visibleLandings(cell, prefs, (l) => paymentFor(l, data.payments) !== undefined)
  const negative = cell.endBalanceCents !== null && cell.endBalanceCents < 0
  return (
    <div className="grid gap-2" aria-label={`Transações de ${date}`}>
      <div className="flex items-start justify-between">
        <span className="w-8" />
        <div className="grid justify-items-center">
          <span className="text-muted-foreground text-xs font-medium">
            {WEEKDAY_SHORT[weekdayOf(date)]}
          </span>
          <span
            className={cn(
              'grid size-11 place-items-center rounded-full text-2xl',
              date === today && 'bg-primary text-primary-foreground',
            )}
          >
            {Number(date.slice(8, 10))}
          </span>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Fechar" onClick={onClose}>
          <X />
        </Button>
      </div>
      {cell.endBalanceCents !== null && (
        <p
          className={cn(
            'text-muted-foreground text-center text-xs tabular-nums',
            negative && 'text-destructive',
          )}
        >
          Saldo no fim do dia: {formatAmountFromCents(cell.endBalanceCents)}
        </p>
      )}
      <div className="grid max-h-80 gap-0.5 overflow-y-auto">
        {items.map(({ landing, skipped }, index) => (
          <EventChip
            key={`${landing.entry.id}-${landing.part?.id ?? 'whole'}-${String(skipped)}-${index}`}
            landing={landing}
            skipped={skipped}
          />
        ))}
        {items.length === 0 && (
          <p className="text-muted-foreground py-2 text-center text-sm">Nada neste dia.</p>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          onClose()
          openQuick(date)
        }}
      >
        <Plus /> Criar neste dia
      </Button>
    </div>
  )
}
