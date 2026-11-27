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

/*
 * Skeleton texts are only visual: drawn by CSS (`content: attr(data-text)`),
 * so they take the very place of the real text but are not in the DOM. While a
 * page streams, React keeps the pending fallbacks in hidden segments; with real
 * text those copies would answer text queries and reach assistive tech.
 */

/** A fixed text of the screen (a title, a label), drawn but not in the DOM. */
export function VisualText({ text, className }: { text: string; className?: string }) {
  return (
    <span
      aria-hidden
      data-text={text}
      className={cn('before:content-[attr(data-text)]', className)}
    />
  )
}

/**
 * A run of text still loading: a pulse behind `sample` set in the surrounding
 * font (the sample is transparent and only visual). Inline like text, so it
 * keeps the line height and wraps across lines as the real text would.
 */
export function TextSkeleton({ sample, className }: { sample: string; className?: string }) {
  return (
    <Skeleton
      aria-hidden
      data-text={sample}
      className={cn(
        'inline box-decoration-clone text-transparent select-none before:content-[attr(data-text)]',
        className,
      )}
    />
  )
}

/** The one thing assistive tech hears while a screen loads (the skeleton itself is inert). */
export function LoadingStatus() {
  return (
    <span role="status" className="sr-only">
      Carregando…
    </span>
  )
}

/** The root attributes of a skeleton: out of the accessibility tree and inert. */
export const SKELETON_ROOT = { 'aria-hidden': true, inert: true, 'data-skeleton': '' } as const

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
      {icon} <VisualText text={label} />
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
          <VisualText text={title} />
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
      {group === null ? <TextSkeleton sample="Investimento" /> : <VisualText text={group.name} />}
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
            <TableHead className={GROUP_COLUMN_CLASS}>
              <VisualText text="Grupo" />
            </TableHead>
            {months.map((m, i) => (
              <TableHead
                key={m ?? i}
                className={cn(
                  'px-1.5 text-right whitespace-nowrap',
                  COLUMN_FIT_CLASSES[i],
                  m !== null && m === today && 'bg-muted/60 text-foreground font-semibold',
                )}
              >
                {m === null ? (
                  <TextSkeleton sample="nov/26" />
                ) : (
                  <VisualText text={monthLabel(m)} />
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow className="text-muted-foreground">
            <TableCell className="bg-card sticky left-0 z-10">
              <VisualText text="Renda" />
            </TableCell>
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
                  <Skeleton
                    data-text="00%"
                    className="inline-block rounded-full px-2 py-0.5 font-mono text-xs text-transparent tabular-nums before:content-[attr(data-text)]"
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
