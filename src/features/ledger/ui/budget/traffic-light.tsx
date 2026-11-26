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
import { formatAmount, formatMoney, formatPercent, monthLabel } from '@/features/ledger/core/format'
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
import { useCallback, useMemo, useState } from 'react'

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

/**
 * The window both the dashboard widget and the budget page open on: the
 * previous and current months, then as many future months as fit the card
 * (`monthColumnsFor`; with only the minimum, the current month and the next
 * ones: `monthsBeforeFor`). `span` is the count used before the card is
 * measured (server render, tests).
 */
export const BUDGET_WINDOW = { span: 5, before: 1 } as const

/** Adaptive month columns: fixed group column, ~100px per month (fits "R$ 10.947,61"), 2 to 12 months. */
export const MONTH_COLUMNS = { groupWidth: 150, monthWidth: 100, min: 2, max: 12 } as const

/**
 * How many month columns fit `width` px of card: never fewer than `min`
 * (current and next: only below that does the table scroll horizontally) and
 * never more than `max` (a year ahead is the useful horizon; the arrows walk
 * further). `null` while the width is unknown.
 */
export function monthColumnsFor(width: number): number | null {
  if (!Number.isFinite(width) || width <= 0) return null
  const fit = Math.floor((width - MONTH_COLUMNS.groupWidth) / MONTH_COLUMNS.monthWidth)
  return Math.min(MONTH_COLUMNS.max, Math.max(MONTH_COLUMNS.min, fit))
}

/**
 * Months before today the window opens on: on tight cards (up to
 * `TIGHT_COLUMNS`) the previous month would take too much of the table, so
 * they open on the current month and what comes next; roomier ones keep
 * `before` for context.
 */
/** Up to this many columns the window opens on the current month. */
export const TIGHT_COLUMNS = 3

export function monthsBeforeFor(columns: number, before: number): number {
  return columns <= TIGHT_COLUMNS ? 0 : before
}

/**
 * Width of the element the returned ref is attached to, kept up to date on
 * resize (0 until measured). A React 19 cleanup ref: React hands it the
 * element on mount and runs the cleanup on unmount, never `null`.
 */
function useElementWidth(): [(element: HTMLDivElement) => () => void, number] {
  const [width, setWidth] = useState(0)
  const ref = useCallback((element: HTMLDivElement) => {
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry?.contentRect.width ?? 0)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

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
  /** How many months the window shows until the card is measured (then: as many as fit). */
  span: number
  /** Months before today in the default window (and on "Hoje") when the card has room. */
  before: number
  className?: string
}) {
  const [measure, width] = useElementWidth()
  const columns = monthColumnsFor(width) ?? span
  // The default window depends on the measured width, so the arrows move an
  // offset from it (not a fixed first month): "Hoje" and resizes stay right.
  const initial = defaultFirstMonth(today, columns, monthsBeforeFor(columns, before))
  const [offset, setOffset] = useState(0)
  const first = addMonths(initial, offset)
  const last = addMonths(first, columns - 1)
  const months = useBudgetMonths(data, versions, first, last)
  const budgetGroups = visibleBudgetGroups(data.budgetGroups, months)
  const versionStarts = new Set(versions.map((p) => p.startsMonth))
  const range = monthRange(first, last)

  return (
    <TooltipProvider delayDuration={150}>
      <div ref={measure} className={cn('grid gap-3', className)}>
        <div className="flex items-center justify-end gap-2">
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Mês anterior"
              onClick={() => setOffset((o) => o - 1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset(0)}
            >
              Hoje
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Próximo mês"
              onClick={() => setOffset((o) => o + 1)}
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
                    'px-1.5 text-right whitespace-nowrap',
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
                    'px-1.5 text-right font-mono text-xs whitespace-nowrap tabular-nums',
                    m.month === today && 'bg-muted/60',
                    versionStarts.has(m.month) && 'border-primary/60 border-l-2',
                  )}
                  title={`Renda: ${formatMoney(m.incomeCents)}`}
                >
                  {formatAmount(m.incomeCents)}
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
