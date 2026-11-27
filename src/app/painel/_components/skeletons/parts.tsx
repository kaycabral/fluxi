'use client'

import { visibleBudgetGroups } from '@/features/ledger/core/budget'
import { monthLabel } from '@/features/ledger/core/format'
import { GROUP_DOT_CLASSES } from '@/features/ledger/core/labels'
import { addMonths, monthRange, type Month } from '@/features/ledger/core/month'
import type { BudgetGroupColor } from '@/features/ledger/core/types'
import {
  COLUMN_FIT_CLASSES,
  defaultFirstMonth,
  GROUP_COLUMN_CLASS,
  MONTH_COLUMNS,
  monthsBeforeFor,
  TABLE_CLASS,
} from '@/features/ledger/ui/budget/traffic-light'
import { useLedgerRefs } from '@/features/ledger/ui/ledger-shell'
import {
  GROUP_LAST_ROW_CLASSES,
  GROUP_ROW_CLASSES,
  POT_ROW_CLASSES,
} from '@/features/ledger/ui/skeleton-shape-hint'
import {
  Button,
  cn,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Typography,
} from '@cbrl/design'
import { Plus } from 'lucide-react'

/*
 * Pieces of the loading skeletons. Each skeleton mirrors the screen it stands
 * for (same primitives, classes and fixed texts; names, colors and months from
 * the space's refs when the painel shell already has them), with only the data
 * blank, so the swap to the real content moves nothing.
 */

/**
 * A run of text still loading: a pulse behind `sample` set in the surrounding
 * font (the sample is transparent). Inline like text, so it keeps the line
 * height and wraps across lines as the real text of that length would.
 */
export function TextSkeleton({ sample, className }: { sample: string; className?: string }) {
  return (
    <Skeleton
      aria-hidden
      className={cn('inline box-decoration-clone text-transparent select-none', className)}
    >
      {sample}
    </Skeleton>
  )
}

/** An amount still loading, in `Money`'s monospace font (same line box). */
export function MoneySkeleton({ sample = 'R$ 00.000,00' }: { sample?: string }) {
  return (
    <span className="font-mono tabular-nums">
      <TextSkeleton sample={sample} />
    </span>
  )
}

/** A button while the page loads: the real primitive, disabled (same box). */
export function ButtonSkeleton({
  label,
  icon = <Plus />,
  variant = 'default',
  size = 'lg',
}: {
  label: string
  icon?: React.ReactNode
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'lg' | 'default' | 'sm'
}) {
  return (
    <Button variant={variant} size={size} disabled tabIndex={-1} aria-hidden>
      {icon} {label}
    </Button>
  )
}

/** A page header: the real title, its muted line loading, an optional primary action. */
export function PageHeaderSkeleton({
  title,
  subtitle,
  action,
  align = 'start',
}: {
  title: string
  /** The muted line under the title (a `TextSkeleton` while unknown; none: no line). */
  subtitle?: React.ReactNode
  action?: string
  align?: 'start' | 'end'
}) {
  return (
    <div
      className={cn(
        'flex justify-between gap-3',
        align === 'end' ? 'flex-wrap items-end' : 'items-start',
      )}
    >
      <div className="grid min-w-0 gap-1">
        <Typography variant="pageTitle" as="h1">
          {title}
        </Typography>
        {subtitle !== undefined && (
          <div className="text-muted-foreground text-sm first-letter:uppercase">{subtitle}</div>
        )}
      </div>
      {action !== undefined && <ButtonSkeleton label={action} />}
    </div>
  )
}

type SkeletonGroup = { key: string; name: string; color: BudgetGroupColor }

/**
 * A budget group row of a skeleton: the real group once the painel shell has
 * the refs, else a nameless row shown only if the shape hint reaches it.
 */
export type SkeletonRow = { key: string; group: SkeletonGroup | null; hintClass: string }

/** The space's active budget groups in order, or hinted placeholders before the refs. */
export function useSkeletonGroups(kind: 'groups' | 'pots' = 'groups'): SkeletonRow[] {
  const refs = useLedgerRefs()
  const groups = refs?.budgetGroups
  if (groups === undefined) {
    const classes = kind === 'groups' ? GROUP_ROW_CLASSES : POT_ROW_CLASSES
    return classes.map((hintClass, i) => ({
      key: `hint-${i}`,
      group: null,
      hintClass: kind === 'groups' ? cn(hintClass, GROUP_LAST_ROW_CLASSES[i]) : hintClass,
    }))
  }
  return visibleBudgetGroups(
    groups.filter((g) => !g.archived && (kind === 'groups' || g.goal === 'minimum')),
    [],
  ).map((group) => ({ key: group.key, group, hintClass: '' }))
}

/** Today's month (`YYYY-MM`) from the refs, `null` before the shell has them. */
export function useSkeletonMonth(): Month | null {
  return useLedgerRefs()?.today.slice(0, 7) ?? null
}

/** A budget group's name with its color square, as the tables show it (blank before the refs). */
export function GroupName({
  group,
  size = 'size-2.5',
}: {
  group: SkeletonGroup | null
  size?: string
}) {
  return (
    <span className="flex items-center gap-2">
      {group === null ? (
        <Skeleton className={cn('shrink-0 rounded-xs', size)} />
      ) : (
        <span className={cn('shrink-0 rounded-xs', size, GROUP_DOT_CLASSES[group.color])} />
      )}
      {group === null ? <TextSkeleton sample="Investimento" /> : group.name}
    </span>
  )
}

/**
 * The budget traffic light (`TrafficLight`) loading: the month arrows and the
 * table with the same adaptive columns, the income row and a row per budget
 * group; only the numbers are blank.
 */
export function TrafficLightSkeleton({ span, before }: { span: number; before: number }) {
  const today = useSkeletonMonth()
  const groups = useSkeletonGroups()
  // Every column, fitted to the card by CSS exactly as the real table does before it measures.
  const first =
    today === null ? null : defaultFirstMonth(today, span, monthsBeforeFor(span, before))
  const months: (Month | null)[] =
    first === null
      ? Array.from({ length: MONTH_COLUMNS.max }, () => null)
      : monthRange(first, addMonths(first, MONTH_COLUMNS.max - 1))

  return (
    <div className="@container grid gap-3" aria-hidden>
      <div className="flex items-center justify-end gap-2">
        <div className="flex items-center gap-1">
          <Skeleton className="size-7" />
          <Skeleton className="h-7 w-[50px]" />
          <Skeleton className="size-7" />
        </div>
      </div>
      <Table className={TABLE_CLASS}>
        <TableHeader>
          <TableRow>
            <TableHead className={GROUP_COLUMN_CLASS}>Grupo</TableHead>
            {months.map((m, i) => (
              <TableHead
                key={m ?? i}
                className={cn(
                  'px-1.5 text-right whitespace-nowrap',
                  COLUMN_FIT_CLASSES[i],
                  m !== null && m === today && 'bg-muted/60 text-foreground font-semibold',
                )}
              >
                {m === null ? <TextSkeleton sample="nov/26" /> : monthLabel(m)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow className="text-muted-foreground">
            <TableCell className="bg-card sticky left-0 z-10">Renda</TableCell>
            {months.map((m, i) => (
              <TableCell
                key={m ?? i}
                className={cn(
                  'px-1.5 text-right font-mono text-xs whitespace-nowrap tabular-nums',
                  COLUMN_FIT_CLASSES[i],
                  m !== null && m === today && 'bg-muted/60',
                )}
              >
                <TextSkeleton sample="00.000,00" />
              </TableCell>
            ))}
          </TableRow>
          {groups.map((row) => (
            <TableRow key={row.key} className={row.hintClass}>
              <TableCell className="bg-card sticky left-0 z-10 truncate whitespace-nowrap">
                <GroupName group={row.group} />
              </TableCell>
              {months.map((m, i) => (
                <TableCell
                  key={m ?? i}
                  className={cn(
                    'px-1 text-right',
                    COLUMN_FIT_CLASSES[i],
                    m !== null && m === today && 'bg-muted/60',
                  )}
                >
                  <Skeleton className="inline-block rounded-full px-2 py-0.5 font-mono text-xs text-transparent tabular-nums">
                    00%
                  </Skeleton>
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
