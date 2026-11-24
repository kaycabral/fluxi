'use client'

import { accountIdsOf } from '@/features/ledger/core/account-filter'
import { calendarMonth } from '@/features/ledger/core/calendar'
import { formatCompactMoney, formatMoney, monthLabel } from '@/features/ledger/core/format'
import { POT_COLORS } from '@/features/ledger/core/labels'
import { addMonths, type Month } from '@/features/ledger/core/month'
import type { Landing } from '@/features/ledger/core/occurrence'
import { paymentStatus, type PaymentStatus } from '@/features/ledger/core/payments'
import { projectWindow, targetFor, type LedgerData } from '@/features/ledger/core/view'
import { Button, Card, CardContent, CardHeader, CardTitle, cn } from '@cbrl/design'
import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo } from 'react'
import { useLedgerUi } from './ledger-shell'
import { AccountSelect } from './selects'

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

function calendarHref(month: Month, account: string) {
  const params = new URLSearchParams({ mes: month })
  if (account !== '') params.set('conta', account)
  return `/painel/calendario?${params.toString()}` as const
}

const STATUS_TITLES: Record<PaymentStatus, (kind: Landing['entry']['kind']) => string> = {
  paid: (kind) => (kind === 'income' ? 'recebido' : 'pago'),
  overdue: () => 'atrasada',
  upcoming: () => '',
}

function EventChip({
  landing,
  status,
  onOpen,
}: {
  landing: Landing
  status: PaymentStatus
  onOpen: () => void
}) {
  const { entry } = landing
  const label = landing.part?.label ?? entry.description
  const statusTitle = STATUS_TITLES[status](entry.kind)
  return (
    <button
      type="button"
      title={`${entry.description} ${formatMoney(landing.amountCents)}${statusTitle === '' ? '' : ` (${statusTitle})`}`}
      onClick={onOpen}
      className={cn(
        'bg-muted hover:bg-muted/70 block w-full truncate rounded-sm px-1 text-left text-[0.65rem] leading-4 sm:text-xs',
        entry.kind === 'income' && 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
        status === 'paid' && 'opacity-60',
        status === 'overdue' && 'ring-destructive text-destructive ring-1',
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
      {formatCompactMoney(landing.amountCents)} {label}
    </button>
  )
}

/** "Calendário": the month grid with entries per day and the end-of-day balance. */
export function CalendarView({
  data,
  month,
  account,
}: {
  data: LedgerData
  month: Month
  account: string
}) {
  const router = useRouter()
  const { openEdit, refs } = useLedgerUi()
  const grid = useMemo(() => {
    const [result] = projectWindow(data, month, month)
    return result === undefined ? null : calendarMonth(result, accountIdsOf(account, data.accounts))
  }, [data, month, account])

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle asChild>
          <h2>Calendário · {monthLabel(month)}</h2>
        </CardTitle>
        <div className="flex items-center gap-2">
          <AccountSelect
            aria-label="Conta"
            className="w-48"
            banks={data.banks}
            accounts={data.accounts}
            withBanks
            allLabel="Todas as contas"
            value={account}
            onValueChange={(next) => router.replace(calendarHref(month, next), { scroll: false })}
          />
          <Button variant="outline" size="icon-sm" asChild>
            <Link href={calendarHref(addMonths(month, -1), account)} aria-label="Mês anterior">
              <ChevronLeft />
            </Link>
          </Button>
          <Button variant="outline" size="icon-sm" asChild>
            <Link href={calendarHref(addMonths(month, 1), account)} aria-label="Próximo mês">
              <ChevronRight />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2">
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
          {grid?.days.map((day) => {
            const negative = day.endBalanceCents !== null && day.endBalanceCents < 0
            return (
              <div
                key={day.day}
                role="group"
                aria-label={negative ? `Dia ${day.day}, saldo negativo` : `Dia ${day.day}`}
                className={cn(
                  'border-border grid min-h-20 min-w-0 grid-rows-[auto_1fr_auto] gap-0.5 rounded border p-0.5 sm:min-h-24 sm:p-1',
                  negative && 'bg-destructive/10 border-destructive/40',
                )}
              >
                <span className="text-muted-foreground font-mono text-xs">{day.day}</span>
                <div className="grid min-w-0 content-start gap-0.5">
                  {day.landings.map((landing, index) => (
                    <EventChip
                      key={`${landing.entry.id}-${landing.part?.id ?? 'whole'}-${index}`}
                      landing={landing}
                      status={paymentStatus(landing, data.payments, refs.today)}
                      onOpen={() => openEdit(targetFor(data, landing))}
                    />
                  ))}
                </div>
                <span
                  className={cn(
                    'text-muted-foreground truncate text-right font-mono text-[0.65rem] tabular-nums sm:text-xs',
                    negative && 'text-destructive',
                  )}
                >
                  {day.endBalanceCents === null ? '' : formatCompactMoney(day.endBalanceCents)}
                </span>
              </div>
            )
          })}
        </div>
        <p className="text-muted-foreground text-xs">
          O número no canto de cada dia é o saldo ao fim daquele dia na conta escolhida. ✓ marca o
          que já foi pago ou recebido; contorno vermelho, o que está atrasado.
        </p>
      </CardContent>
    </Card>
  )
}
