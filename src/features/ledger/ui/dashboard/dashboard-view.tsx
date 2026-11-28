'use client'

import type { ConnectionHealth } from '@/features/bank-feed/core/health'
import {
  budgetGroupCell,
  hasIncome,
  lightSummary,
  visibleBudgetGroups,
  type BudgetMonth,
} from '@/features/ledger/core/budget'
import {
  balanceSnapshot,
  bankBalancesOn,
  monthEndBalances,
  monthTotalsOf,
  withConnectedBanks,
  type MonthBalance,
} from '@/features/ledger/core/dashboard'
import {
  dayLongLabel,
  formatMoney,
  monthLabel,
  monthLongLabel,
} from '@/features/ledger/core/format'
import { GROUP_DOT_CLASSES } from '@/features/ledger/core/labels'
import { addMonths, type Month } from '@/features/ledger/core/month'
import { budgetGroupMonthQuery } from '@/features/ledger/core/search'
import type { BudgetGroup, BudgetVersion } from '@/features/ledger/core/types'
import { projectWindow, type LedgerData } from '@/features/ledger/core/view'
import { formatAmountFromCents } from '@cbrl/br/money'
import {
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  EmptyState,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Typography,
} from '@cbrl/design'
import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react'
import Link from 'next/link'
import { useMemo } from 'react'
import { BUDGET_WINDOW, TrafficLight, useBudgetMonth } from '../budget/traffic-light'
import { Money, toneOf } from '../money'
import { TransactionsLink } from '../transactions-link'
import { BankAvatars } from './bank-avatars'
import { UpcomingBills } from './upcoming-bills'

function Stat({
  label,
  cents,
  hint,
  tone = false,
  alert = false,
}: {
  label: string
  cents: number
  hint?: React.ReactNode
  tone?: boolean
  alert?: boolean
}) {
  return (
    <Card size="sm" className={cn(alert && 'border-destructive/50')}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">
          <Money
            cents={cents}
            tone={tone}
            className={cn(!tone && cents < 0 && 'text-destructive')}
          />
        </CardTitle>
      </CardHeader>
      {hint !== undefined && (
        <CardContent className="text-muted-foreground -mt-2 text-xs">{hint}</CardContent>
      )}
    </Card>
  )
}

/** Month-end balance of the next 12 months as bars (red below zero). */
function BalanceChart({ balances, today }: { balances: MonthBalance[]; today: Month }) {
  const values = balances.map((b) => b.closingCents)
  // Each side of the zero line takes height in proportion to its largest bar, so a small
  // negative month no longer reserves half the chart.
  const up = Math.max(0, ...values)
  const down = Math.max(0, ...values.map((v) => -v))
  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div
          className="flex min-h-0 flex-1 items-stretch gap-1"
          role="img"
          aria-label={balances
            .map((b) => `${monthLabel(b.month)}: ${formatMoney(b.closingCents)}`)
            .join('; ')}
        >
          {balances.map((b) => {
            const cents = b.closingCents
            const height = `${(Math.abs(cents) / (cents > 0 ? up : down)) * 100}%`
            return (
              <Tooltip key={b.month}>
                <TooltipTrigger asChild>
                  <div className="flex min-w-0 flex-1 flex-col">
                    {/* Upper half: positive bars grow up from the zero line. */}
                    <div className="flex items-end" style={{ flexGrow: up, flexBasis: 0 }}>
                      {cents > 0 && (
                        <div
                          className={cn(
                            'bg-primary/70 min-h-1 w-full rounded-t-sm',
                            b.month === today && 'bg-primary',
                          )}
                          style={{ height }}
                        />
                      )}
                    </div>
                    <div className="bg-border h-px" />
                    <div className="flex items-start" style={{ flexGrow: down, flexBasis: 0 }}>
                      {cents < 0 && (
                        <div
                          className="bg-destructive/80 min-h-1 w-full rounded-b-sm"
                          style={{ height }}
                        />
                      )}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  Fim de {monthLabel(b.month)}: {formatMoney(b.closingCents)}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
        <div className="text-muted-foreground flex gap-1 text-[10px]">
          {balances.map((b) => (
            <span
              key={b.month}
              className={cn(
                'min-w-0 flex-1 truncate text-center',
                b.month === today && 'text-foreground font-medium',
              )}
            >
              {monthLabel(b.month).slice(0, 3)}
            </span>
          ))}
        </div>
      </div>
    </TooltipProvider>
  )
}

/** Share of the target already planned, capped at 100% (any spending against a 0% target fills it). */
function fillOf(plannedCents: number, targetCents: number): number {
  if (targetCents > 0) return Math.min(1, plannedCents / targetCents)
  return plannedCents > 0 ? 1 : 0
}

const BAR_ALERT = { warn: 'bg-warning', bad: 'bg-destructive' } as const

/** Each budget group this month: planned spending against the target of the version in force. */
function BudgetGroupsThisMonth({
  budgetGroups,
  month,
}: {
  budgetGroups: readonly BudgetGroup[]
  month: BudgetMonth
}) {
  const label = `Grupos em ${monthLabel(month.month)}`
  if (month.version === null) {
    return (
      <EmptyState
        title="Sem metas para este mês"
        description="Crie uma versão do orçamento que valha a partir deste mês."
        className="py-6"
      />
    )
  }
  return (
    <ul className="grid gap-3" aria-label={label}>
      {budgetGroups.map((budgetGroup) => {
        const cell = budgetGroupCell(budgetGroup, month)
        const target = cell.targetCents ?? 0
        const fill = fillOf(cell.plannedCents, target)
        return (
          <li key={budgetGroup.key} className="grid gap-1">
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    'size-2.5 shrink-0 rounded-xs',
                    GROUP_DOT_CLASSES[budgetGroup.color],
                  )}
                />
                <TransactionsLink
                  query={budgetGroupMonthQuery(budgetGroup.key, month.month)}
                  aria-label={`${budgetGroup.name}: ver transações de ${monthLabel(month.month)}`}
                  className="truncate underline-offset-4 hover:underline"
                >
                  {budgetGroup.name}
                </TransactionsLink>
              </span>
              <span
                className="text-muted-foreground shrink-0 font-mono text-xs tabular-nums"
                aria-label={`${formatMoney(cell.plannedCents)} planejado de ${formatMoney(target)}`}
                title={`${formatMoney(cell.plannedCents)} planejado de ${formatMoney(target)}`}
              >
                {formatAmountFromCents(cell.plannedCents)} / {formatAmountFromCents(target)}
              </span>
            </div>
            <div className="bg-muted h-1.5 overflow-hidden rounded-full">
              <div
                className={cn(
                  'h-full rounded-full',
                  cell.light === 'bad' || cell.light === 'warn'
                    ? BAR_ALERT[cell.light]
                    : GROUP_DOT_CLASSES[budgetGroup.color],
                )}
                style={{ width: `${fill * 100}%` }}
              />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** The budget card's line: how many groups are within, near or off target this month. */
function budgetSummary(
  budget: BudgetMonth,
  lights: { good: number; warn: number; bad: number },
  monthName: string,
): string {
  if (budget.version === null) return 'Planejado ÷ renda do mês, por grupo.'
  if (!hasIncome(budget)) return `${monthName}: sem renda prevista, nada a medir.`
  return `${monthName}: ${lights.good} dentro, ${lights.warn} perto e ${lights.bad} fora da meta.`
}

/**
 * "Painel": the quick look. Balance cards, the traffic light of the budget,
 * the bills coming up, the month-end balance ahead and each budget group this month.
 * Everything over every account (filter in Transações/Calendário to narrow).
 */
export function DashboardView({
  data,
  versions,
  today,
  connectedBanks = [],
  bankHealth = {},
}: {
  data: LedgerData
  versions: readonly BudgetVersion[]
  /** `YYYY-MM-DD` in São Paulo. */
  today: string
  /** Institutions connected in the space with no linked account (shown at R$ 0,00). */
  connectedBanks?: readonly string[]
  /** Connection health per bank id (connected banks only; see `healthByBank`). */
  bankHealth?: Readonly<Record<string, ConnectionHealth>>
}) {
  const month = today.slice(0, 7)
  const results = useMemo(() => projectWindow(data, month, addMonths(month, 11)), [data, month])
  // The window starts at the current month, so it is always projected.
  const snapshot = balanceSnapshot(results, today) ?? {
    todayCents: 0,
    monthEndCents: 0,
    lowestCents: 0,
    lowestDate: today,
  }
  const thisMonth = monthTotalsOf(results, month)
  const budget = useBudgetMonth(data, versions, month)
  const budgetGroups = visibleBudgetGroups(data.budgetGroups, [budget])
  const lights = lightSummary(budgetGroups, budget)
  const monthEndDelta = snapshot.monthEndCents - snapshot.todayCents
  const banks = withConnectedBanks(
    bankBalancesOn(results, today, data.accounts, data.banks),
    connectedBanks,
  )

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="grid gap-1">
        <Typography variant="pageTitle" as="h1">
          Painel
        </Typography>
        <p className="text-muted-foreground text-sm first-letter:uppercase">
          {dayLongLabel(today)}
        </p>
      </div>
    </div>
  )

  if (data.accounts.length === 0) {
    return (
      <div className="grid gap-4">
        {header}
        <EmptyState
          title="Cadastre seu primeiro banco e conta"
          description="O painel resume saldos, contas a pagar e o orçamento assim que houver contas e transações."
          action={{ label: 'Criar conta', href: '#configuracoes/contas' }}
        />
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {header}

      <section aria-label="Resumo" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat
          label="Saldo hoje"
          cents={snapshot.todayCents}
          hint={
            banks.length > 0 ? (
              <BankAvatars banks={banks} health={bankHealth} today={today} />
            ) : undefined
          }
        />
        <Stat
          label={`Fim de ${monthLabel(month)}`}
          cents={snapshot.monthEndCents}
          hint={
            <span className={cn('inline-flex items-center gap-1', toneOf(monthEndDelta))}>
              {monthEndDelta < 0 ? (
                <TrendingDown className="size-3.5" />
              ) : (
                <TrendingUp className="size-3.5" />
              )}
              {formatMoney(monthEndDelta)} até o fim do mês
            </span>
          }
        />
        <Stat
          label="Resultado do mês"
          cents={thisMonth.netCents}
          tone
          hint={`Entradas ${formatMoney(thisMonth.incomeCents)} · Saídas ${formatMoney(thisMonth.expenseCents)}`}
        />
        <Stat
          label="Menor saldo previsto"
          cents={snapshot.lowestCents}
          alert={snapshot.lowestCents < 0}
          hint={`Em ${snapshot.lowestDate.slice(8, 10)}/${snapshot.lowestDate.slice(5, 7)}, até o fim do próximo mês`}
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle asChild>
              <h2>Orçamento</h2>
            </CardTitle>
            <CardDescription>
              {budgetSummary(budget, lights, monthLongLabel(month))}
            </CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/painel/orcamento">
                  Orçamento <ArrowRight />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="min-w-0">
            <TrafficLight
              data={data}
              versions={versions}
              today={month}
              span={BUDGET_WINDOW.span}
              before={BUDGET_WINDOW.before}
            />
          </CardContent>
        </Card>

        <UpcomingBills data={data} today={today} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Card className="h-[22rem] min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle asChild>
              <h2>Saldo projetado</h2>
            </CardTitle>
            <CardDescription>Saldo de todas as contas no fim de cada mês.</CardDescription>
            <CardAction>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/painel/calendario">
                  Calendário <ArrowRight />
                </Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col">
            <BalanceChart balances={monthEndBalances(results)} today={month} />
          </CardContent>
        </Card>

        <Card className="min-h-[22rem] min-w-0">
          <CardHeader>
            <CardTitle asChild>
              <h2>Grupos em {monthLabel(month)}</h2>
            </CardTitle>
            <CardDescription>
              Planejado ÷ meta · renda{' '}
              <span title={formatMoney(budget.incomeCents)}>
                {formatAmountFromCents(budget.incomeCents)}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BudgetGroupsThisMonth budgetGroups={budgetGroups} month={budget} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
