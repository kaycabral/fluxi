'use client'

import { changeDayAction } from '@/features/ledger/adapters/actions/entries'
import { decisionAccountIds } from '@/features/ledger/core/account-filter'
import { calendarMonth, isMovable, withMoves, type DayMove } from '@/features/ledger/core/calendar'
import { describeOccurrenceChange } from '@/features/ledger/core/entry-form'
import {
  dayLongLabel,
  formatAmount,
  formatMoney,
  isoDate,
  monthLongLabel,
} from '@/features/ledger/core/format'
import { POT_COLORS, potTint } from '@/features/ledger/core/labels'
import { addMonths, type Month } from '@/features/ledger/core/month'
import type { Landing } from '@/features/ledger/core/occurrence'
import { paymentStatus, type PaymentStatus } from '@/features/ledger/core/payments'
import type { EditScope } from '@/features/ledger/core/scoped-edit'
import { projectWindow, targetFor, type LedgerData } from '@/features/ledger/core/view'
import { Button, cn, Popover, PopoverContent, PopoverTrigger } from '@cbrl/design'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useOptimistic, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useLedgerUi } from './ledger-shell'
import { QuickAddForm } from './quick-add'
import { AccountSelect } from './selects'

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

function calendarHref(month: Month | null, account: string) {
  const params = new URLSearchParams()
  if (month !== null) params.set('mes', month)
  if (account !== '') params.set('conta', account)
  const query = params.toString()
  return query === '' ? ('/painel' as const) : (`/painel?${query}` as const)
}

const STATUS_TITLES: Record<PaymentStatus, (kind: Landing['entry']['kind']) => string> = {
  paid: (kind) => (kind === 'income' ? 'recebido' : 'pago'),
  overdue: () => 'atrasada',
  upcoming: () => '',
}

function EventChip({
  landing,
  status,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
}: {
  landing: Landing
  status: PaymentStatus
  dragging: boolean
  onOpen: () => void
  onDragStart: () => void
  onDragEnd: () => void
}) {
  const { entry } = landing
  const label = landing.part?.label ?? entry.description
  const statusTitle = STATUS_TITLES[status](entry.kind)
  const movable = isMovable(landing)
  return (
    <button
      type="button"
      title={`${entry.description} ${formatMoney(landing.amountCents)}${statusTitle === '' ? '' : ` (${statusTitle})`}`}
      onClick={onOpen}
      draggable={movable}
      onDragStart={(e) => {
        // Firefox only starts a drag with data set.
        e.dataTransfer.setData('text/plain', entry.description)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      className={cn(
        'bg-muted hover:bg-muted/70 block w-full truncate rounded-sm px-1 text-left text-[0.65rem] leading-4 sm:text-xs',
        movable && 'cursor-grab active:cursor-grabbing',
        potTint(entry.pot),
        entry.kind === 'income' && 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
        status === 'paid' && 'opacity-60',
        status === 'overdue' && 'ring-destructive text-destructive ring-1',
        dragging && 'opacity-40',
      )}
    >
      {status === 'paid' && (
        <Check className="mr-0.5 inline size-3 align-[-2px]" aria-label={statusTitle} />
      )}
      {entry.kind === 'expense' && entry.pot !== null && (
        <span
          className={cn('mr-1 inline-block h-2.5 w-[3px] align-middle', POT_COLORS[entry.pot])}
          aria-hidden
        />
      )}
      {formatAmount(landing.amountCents)} {label}
    </button>
  )
}

/**
 * "Calendário", the main view: the month grid with entries per day and the
 * end-of-day balance. Clicking a day (or its number) opens the quick add;
 * dragging an entry moves it to another day.
 */
export function CalendarView({
  data,
  month,
  account,
  today,
}: {
  data: LedgerData
  month: Month
  account: string
  /** `YYYY-MM-DD`, highlighted when it falls in `month`. */
  today: string
}) {
  const router = useRouter()
  const { openEdit, requestScope, refs } = useLedgerUi()
  const grid = useMemo(() => {
    const [result] = projectWindow(data, month, month)
    return result === undefined
      ? null
      : calendarMonth(result, decisionAccountIds(account, data.accounts))
  }, [data, month, account])

  // Drag a chip to another day (like a calendar event); recurring ones ask the scope.
  const [dragged, setDragged] = useState<Landing | null>(null)
  const [overDay, setOverDay] = useState<number | null>(null)
  const [moves, addMove] = useOptimistic<DayMove[], DayMove>([], (current, move) => [
    ...current,
    move,
  ])
  const [, startTransition] = useTransition()
  const [quickDay, setQuickDay] = useState<number | null>(null)
  const days = useMemo(() => (grid === null ? [] : withMoves(grid.days, moves)), [grid, moves])

  async function moveTo(landing: Landing, day: number) {
    if (day === landing.day) return
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
      addMove({ entryId: landing.entry.id, competence: landing.competence, day })
      const result = await changeDayAction({
        entryId: landing.entry.id,
        month: landing.competence,
        day,
        scope,
      })
      if (!result.ok) toast.error(result.error)
    })
  }

  function endDrag() {
    setDragged(null)
    setOverDay(null)
  }

  return (
    <section aria-labelledby="calendar-title" className="grid gap-3">
      <header className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={calendarHref(null, account)}>Hoje</Link>
        </Button>
        <div className="flex items-center">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href={calendarHref(addMonths(month, -1), account)} aria-label="Mês anterior">
              <ChevronLeft />
            </Link>
          </Button>
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href={calendarHref(addMonths(month, 1), account)} aria-label="Próximo mês">
              <ChevronRight />
            </Link>
          </Button>
        </div>
        <h1 id="calendar-title" className="text-xl font-semibold first-letter:uppercase">
          {monthLongLabel(month)}
        </h1>
        <AccountSelect
          aria-label="Conta"
          className="ml-auto w-48"
          banks={data.banks}
          accounts={data.accounts}
          withBanks
          allLabel="Todo o disponível"
          value={account}
          onValueChange={(next) => router.replace(calendarHref(month, next), { scroll: false })}
        />
      </header>
      <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-muted-foreground text-center text-xs">
            {d}
          </div>
        ))}
        {grid !== null &&
          Array.from({ length: grid.leadingBlanks }, (_, i) => (
            <div key={`blank-${i}`} aria-hidden />
          ))}
        {days.map((day) => {
          const negative = day.endBalanceCents !== null && day.endBalanceCents < 0
          const date = isoDate(month, day.day)
          const isToday = date === today
          return (
            <div
              key={day.day}
              role="group"
              aria-label={negative ? `Dia ${day.day}, saldo negativo` : `Dia ${day.day}`}
              onDragOver={(e) => {
                if (dragged === null) return
                e.preventDefault()
                e.dataTransfer.dropEffect = 'move'
                setOverDay(day.day)
              }}
              onDragLeave={() => setOverDay((current) => (current === day.day ? null : current))}
              onDrop={(e) => {
                e.preventDefault()
                const landing = dragged
                endDrag()
                if (landing !== null) void moveTo(landing, day.day)
              }}
              className={cn(
                'border-border hover:bg-muted/40 relative grid min-h-20 min-w-0 grid-rows-[auto_1fr] gap-0.5 rounded border p-0.5 sm:min-h-24 sm:p-1',
                negative && 'bg-destructive/10 border-destructive/40',
                overDay === day.day && 'ring-primary bg-primary/5 ring-2',
              )}
            >
              {/* First row: room for the day number (drawn by the trigger), the end balance on the right. */}
              <div className="flex h-6 min-w-0 items-center justify-end pl-7">
                <span
                  className={cn(
                    'text-muted-foreground pointer-events-none relative truncate text-right font-mono text-[0.65rem] tabular-nums sm:text-xs',
                    negative && 'text-destructive',
                  )}
                >
                  {day.endBalanceCents === null ? '' : formatAmount(day.endBalanceCents)}
                </span>
              </div>
              <Popover
                open={quickDay === day.day}
                onOpenChange={(open) => setQuickDay(open ? day.day : null)}
              >
                <PopoverTrigger asChild>
                  {/* Covers the whole day: a click on any empty spot creates there. */}
                  <button
                    type="button"
                    aria-label={`Criar lançamento em ${dayLongLabel(date)}`}
                    aria-current={isToday ? 'date' : undefined}
                    className="group/day focus-visible:ring-ring absolute inset-0 flex cursor-pointer items-start justify-start rounded p-0.5 outline-none focus-visible:ring-2 sm:p-1"
                  >
                    <span
                      className={cn(
                        'text-muted-foreground group-hover/day:bg-muted grid size-6 place-items-center rounded-full font-mono text-xs',
                        isToday &&
                          'bg-primary text-primary-foreground group-hover/day:bg-primary/90',
                      )}
                    >
                      {day.day}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-72"
                  onOpenAutoFocus={(event) => {
                    event.preventDefault()
                    document.getElementById('quick-amount')?.focus()
                  }}
                >
                  <QuickAddForm date={date} onDone={() => setQuickDay(null)} />
                </PopoverContent>
              </Popover>
              {/* Above the background button; only the chips take clicks. */}
              <div className="pointer-events-none relative grid min-w-0 content-start gap-0.5 *:pointer-events-auto">
                {day.landings.map((landing, index) => (
                  <EventChip
                    key={`${landing.entry.id}-${landing.part?.id ?? 'whole'}-${index}`}
                    landing={landing}
                    status={paymentStatus(landing, data.payments, refs.today)}
                    dragging={dragged === landing}
                    onOpen={() => openEdit(targetFor(data, landing))}
                    onDragStart={() => setDragged(landing)}
                    onDragEnd={endDrag}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-muted-foreground text-xs">
        O número no canto de cada dia é o saldo ao fim daquele dia na conta escolhida (por padrão,
        todo o dinheiro disponível, sem benefícios). ✓ marca o que já foi pago ou recebido; contorno
        vermelho, o que está atrasado. Clique num dia para criar um lançamento; arraste um
        lançamento para outro dia para mudar a data.
      </p>
    </section>
  )
}
