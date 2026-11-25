'use client'

import {
  budgetMonths,
  planFor,
  potCell,
  visiblePots,
  type BudgetMonth,
  type Light,
  type PotCell,
} from '@/features/ledger/core/budget'
import { formatMoney, formatPercent, monthLabel } from '@/features/ledger/core/format'
import { POT_DOT_CLASSES } from '@/features/ledger/core/labels'
import { addMonths, monthRange, type Month } from '@/features/ledger/core/month'
import type { BudgetPlan, Pot } from '@/features/ledger/core/types'
import { projectWindow, type LedgerData } from '@/features/ledger/core/view'
import {
  Button,
  cn,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@cbrl/design'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'

export const LIGHT_CLASSES: Record<Light, string> = {
  good: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  warn: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  bad: 'bg-destructive/15 text-destructive',
}

export const LIGHT_LABELS: Record<Light, string> = {
  good: 'dentro da meta',
  warn: 'perto da meta',
  bad: 'fora da meta',
}

const NO_PLAN_CLASS = 'bg-muted text-muted-foreground'

const LEGEND: Record<Light, string> = {
  good: 'Dentro da meta',
  warn: 'Até 20% fora',
  bad: 'Mais de 20% fora',
}

/** First month shown by default: `span` months ending two months after today. */
export function defaultFirstMonth(today: Month, span: number): Month {
  return addMonths(today, -(span - 3))
}

/** Budget months (income, spending per pot, version in force) over `[from, to]`. */
export function useBudgetMonths(
  data: LedgerData,
  plans: readonly BudgetPlan[],
  from: Month,
  to: Month,
): BudgetMonth[] {
  return useMemo(() => budgetMonths(projectWindow(data, from, to), plans), [data, plans, from, to])
}

/** Budget numbers of one month (no spending and no income when nothing lands there). */
export function useBudgetMonth(
  data: LedgerData,
  plans: readonly BudgetPlan[],
  month: Month,
): BudgetMonth {
  const [found] = useBudgetMonths(data, plans, month, month)
  return found ?? { month, incomeCents: 0, byPot: {}, plan: planFor(month, plans) }
}

function cellTitle(pot: Pot, month: BudgetMonth, cell: PotCell): string {
  const planned = `${formatMoney(cell.plannedCents)} planejado (${formatPercent(cell.ratio)} da renda)`
  if (cell.targetBps === null || cell.light === null) {
    return `${pot.name} em ${monthLabel(month.month)}: ${planned}. Sem meta: mês antes da primeira versão do orçamento.`
  }
  const target = `meta ${pot.goal === 'minimum' ? 'mínima ' : ''}${formatPercent(cell.targetBps / 10000)} (${formatMoney(cell.targetCents ?? 0)})`
  return `${pot.name} em ${monthLabel(month.month)}: ${planned}, ${target}. ${LIGHT_LABELS[cell.light]}.`
}

/**
 * "Semáforo mensal": each pot's planned share of the month's income against
 * the budget version in force that month (so changing the proportions never
 * repaints earlier months). Arrows walk the months; the current month is
 * highlighted and the month a new version starts is marked.
 */
export function TrafficLight({
  data,
  plans,
  today,
  span,
  className,
}: {
  data: LedgerData
  plans: readonly BudgetPlan[]
  /** Current month. */
  today: Month
  /** How many months the window shows. */
  span: number
  className?: string
}) {
  const initial = defaultFirstMonth(today, span)
  const [first, setFirst] = useState(initial)
  const last = addMonths(first, span - 1)
  const months = useBudgetMonths(data, plans, first, last)
  const pots = visiblePots(data.pots, months)
  const planStarts = new Set(plans.map((p) => p.startsMonth))
  const range = monthRange(first, last)

  return (
    <TooltipProvider delayDuration={150}>
      <div className={cn('grid gap-3', className)}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-sm tabular-nums" aria-live="polite">
            {monthLabel(first)} – {monthLabel(last)}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Mês anterior"
              onClick={() => setFirst((m) => addMonths(m, -1))}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={first === initial}
              onClick={() => setFirst(initial)}
            >
              Hoje
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Próximo mês"
              onClick={() => setFirst((m) => addMonths(m, 1))}
            >
              <ChevronRight />
            </Button>
          </div>
        </div>

        <Table className="text-sm">
          <TableHeader>
            <TableRow>
              <TableHead className="bg-card sticky left-0 z-10">Pote</TableHead>
              {range.map((m) => (
                <TableHead
                  key={m}
                  className={cn(
                    'text-right whitespace-nowrap',
                    m === today && 'bg-muted/60 text-foreground font-semibold',
                    planStarts.has(m) && 'border-primary/60 border-l-2',
                  )}
                  aria-current={m === today ? 'date' : undefined}
                >
                  {planStarts.has(m) ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help underline decoration-dotted underline-offset-4">
                          {monthLabel(m)}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Nova versão do orçamento a partir daqui</TooltipContent>
                    </Tooltip>
                  ) : (
                    monthLabel(m)
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="text-muted-foreground">
              <TableCell className="bg-card sticky left-0 z-10">Renda</TableCell>
              {months.map((m) => (
                <TableCell
                  key={m.month}
                  className={cn(
                    'text-right font-mono text-xs whitespace-nowrap tabular-nums',
                    m.month === today && 'bg-muted/60',
                    planStarts.has(m.month) && 'border-primary/60 border-l-2',
                  )}
                >
                  {formatMoney(m.incomeCents)}
                </TableCell>
              ))}
            </TableRow>
            {pots.map((pot) => (
              <TableRow key={pot.key}>
                <TableCell className="bg-card sticky left-0 z-10 whitespace-nowrap">
                  <span className="flex items-center gap-2">
                    <span
                      className={cn('size-2.5 shrink-0 rounded-xs', POT_DOT_CLASSES[pot.color])}
                      aria-hidden
                    />
                    {pot.name}
                    {pot.archived && (
                      <span className="text-muted-foreground text-xs">(arquivado)</span>
                    )}
                  </span>
                </TableCell>
                {months.map((m) => {
                  const cell = potCell(pot, m)
                  const label = cellTitle(pot, m, cell)
                  return (
                    <TableCell
                      key={m.month}
                      className={cn(
                        'px-1 text-right',
                        m.month === today && 'bg-muted/60',
                        planStarts.has(m.month) && 'border-primary/60 border-l-2',
                      )}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label={label}
                            className={cn(
                              'focus-visible:ring-ring inline-block cursor-default rounded-full px-2 py-0.5 font-mono text-xs tabular-nums outline-none focus-visible:ring-2',
                              cell.light === null ? NO_PLAN_CLASS : LIGHT_CLASSES[cell.light],
                            )}
                          >
                            {formatPercent(cell.ratio)}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-64">{label}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                  )
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {(['good', 'warn', 'bad'] as const).map((light) => (
            <li key={light} className="flex items-center gap-1.5">
              <span className={cn('size-2.5 rounded-full', LIGHT_CLASSES[light])} aria-hidden />
              {LEGEND[light]}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-full', NO_PLAN_CLASS)} aria-hidden />
            Sem meta no mês
          </li>
        </ul>
      </div>
    </TooltipProvider>
  )
}
