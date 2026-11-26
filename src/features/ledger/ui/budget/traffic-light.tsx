'use client'

import {
  budgetGroupCell,
  budgetMonths,
  versionFor,
  visibleBudgetGroups,
  type BudgetGroupCell,
  type BudgetMonth,
  type Light,
} from '@/features/ledger/core/budget'
import { formatMoney, formatPercent, monthLabel } from '@/features/ledger/core/format'
import { GROUP_DOT_CLASSES } from '@/features/ledger/core/labels'
import { addMonths, monthRange, type Month } from '@/features/ledger/core/month'
import type { BudgetGroup, BudgetVersion } from '@/features/ledger/core/types'
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

const NO_VERSION_CLASS = 'bg-muted text-muted-foreground'

/** The window both the dashboard widget and the budget page open on: previous, current and the next 3 months. */
export const BUDGET_WINDOW = { span: 5, before: 1 } as const

/** First month shown by default: `before` months before today (default: the window ends two months after today). */
export function defaultFirstMonth(today: Month, span: number, before = span - 3): Month {
  return addMonths(today, -before)
}

/** Budget months (income, spending per budget group, version in force) over `[from, to]`. */
export function useBudgetMonths(
  data: LedgerData,
  versions: readonly BudgetVersion[],
  from: Month,
  to: Month,
): BudgetMonth[] {
  return useMemo(
    () => budgetMonths(projectWindow(data, from, to), versions),
    [data, versions, from, to],
  )
}

/** Budget numbers of one month (no spending and no income when nothing lands there). */
export function useBudgetMonth(
  data: LedgerData,
  versions: readonly BudgetVersion[],
  month: Month,
): BudgetMonth {
  const [found] = useBudgetMonths(data, versions, month, month)
  return found ?? { month, incomeCents: 0, byBudgetGroup: {}, version: versionFor(month, versions) }
}

function cellTitle(budgetGroup: BudgetGroup, month: BudgetMonth, cell: BudgetGroupCell): string {
  const planned = `${formatMoney(cell.plannedCents)} planejado (${formatPercent(cell.ratio)} da renda)`
  if (cell.targetBps === null || cell.light === null) {
    return `${budgetGroup.name} em ${monthLabel(month.month)}: ${planned}. Sem meta: mês antes da primeira versão do orçamento.`
  }
  const target = `meta ${budgetGroup.goal === 'minimum' ? 'mínima ' : ''}${formatPercent(cell.targetBps / 10000)} (${formatMoney(cell.targetCents ?? 0)})`
  return `${budgetGroup.name} em ${monthLabel(month.month)}: ${planned}, ${target}. ${LIGHT_LABELS[cell.light]}.`
}

/**
 * "Semáforo mensal": each budget group's planned share of the month's income against
 * the budget version in force that month (so changing the proportions never
 * repaints earlier months). Arrows walk the months; the current month is
 * highlighted and the month a new version starts is marked.
 */
export function TrafficLight({
  data,
  versions,
  today,
  span,
  before,
  className,
}: {
  data: LedgerData
  versions: readonly BudgetVersion[]
  /** Current month. */
  today: Month
  /** How many months the window shows. */
  span: number
  /** Months before today in the default window (and on "Hoje"). */
  before?: number
  className?: string
}) {
  const initial = defaultFirstMonth(today, span, before)
  const [first, setFirst] = useState(initial)
  const last = addMonths(first, span - 1)
  const months = useBudgetMonths(data, versions, first, last)
  const budgetGroups = visibleBudgetGroups(data.budgetGroups, months)
  const versionStarts = new Set(versions.map((p) => p.startsMonth))
  const range = monthRange(first, last)

  return (
    <TooltipProvider delayDuration={150}>
      <div className={cn('grid gap-3', className)}>
        <div className="flex items-center justify-end gap-2">
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
              <TableHead className="bg-card sticky left-0 z-10">Grupo</TableHead>
              {range.map((m) => (
                <TableHead
                  key={m}
                  className={cn(
                    'text-right whitespace-nowrap',
                    m === today && 'bg-muted/60 text-foreground font-semibold',
                    versionStarts.has(m) && 'border-primary/60 border-l-2',
                  )}
                  aria-current={m === today ? 'date' : undefined}
                >
                  {versionStarts.has(m) ? (
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
                    versionStarts.has(m.month) && 'border-primary/60 border-l-2',
                  )}
                >
                  {formatMoney(m.incomeCents)}
                </TableCell>
              ))}
            </TableRow>
            {budgetGroups.map((budgetGroup) => (
              <TableRow key={budgetGroup.key}>
                <TableCell className="bg-card sticky left-0 z-10 whitespace-nowrap">
                  <span className="flex items-center gap-2">
                    <span
                      className={cn(
                        'size-2.5 shrink-0 rounded-xs',
                        GROUP_DOT_CLASSES[budgetGroup.color],
                      )}
                      aria-hidden
                    />
                    {budgetGroup.name}
                    {budgetGroup.archived && (
                      <span className="text-muted-foreground text-xs">(arquivado)</span>
                    )}
                  </span>
                </TableCell>
                {months.map((m) => {
                  const cell = budgetGroupCell(budgetGroup, m)
                  const label = cellTitle(budgetGroup, m, cell)
                  return (
                    <TableCell
                      key={m.month}
                      className={cn(
                        'px-1 text-right',
                        m.month === today && 'bg-muted/60',
                        versionStarts.has(m.month) && 'border-primary/60 border-l-2',
                      )}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            aria-label={label}
                            className={cn(
                              'focus-visible:ring-ring inline-block cursor-default rounded-full px-2 py-0.5 font-mono text-xs tabular-nums outline-none focus-visible:ring-2',
                              cell.light === null ? NO_VERSION_CLASS : LIGHT_CLASSES[cell.light],
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
      </div>
    </TooltipProvider>
  )
}
