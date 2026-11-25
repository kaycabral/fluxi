'use client'

import { accountLabel } from '@/features/ledger/core/account-filter'
import { formatMoney } from '@/features/ledger/core/format'
import {
  groupPayables,
  payablesWindow,
  type PayableGroup,
  type PayableGroupKey,
} from '@/features/ledger/core/payments'
import {
  installmentLabel,
  projectWindow,
  targetFor,
  type LedgerData,
} from '@/features/ledger/core/view'
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  EmptyState,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@cbrl/design'
import { useMemo } from 'react'
import { useLedgerUi } from '../ledger-shell'
import { Money } from '../money'
import { PayButton } from '../paid-controls'

const TABS = [
  { key: 'overdue', label: 'Atrasadas', empty: 'Nada atrasado.' },
  { key: 'next7', label: '7 dias', empty: 'Nada vence nos próximos 7 dias.' },
  { key: 'restOfMonth', label: 'Este mês', empty: 'Nada mais até o fim do mês.' },
  { key: 'nextMonth', label: 'Próximo mês', empty: 'Nada previsto para o próximo mês.' },
] as const satisfies readonly { key: PayableGroupKey; label: string; empty: string }[]

type TabKey = (typeof TABS)[number]['key']

/** The tab to open first: overdue when there is any, else the next 7 days, else the first with items. */
export function initialTab(groups: readonly Pick<PayableGroup, 'key'>[]): TabKey {
  const has = (key: TabKey) => groups.some((g) => g.key === key)
  if (has('overdue')) return 'overdue'
  if (has('next7')) return 'next7'
  return TABS.find((t) => has(t.key))?.key ?? 'next7'
}

function BillList({ group, data }: { group: PayableGroup; data: LedgerData }) {
  const { openEdit } = useLedgerUi()
  const label = (id: string | null) => accountLabel(id, data.accounts, data.banks)
  return (
    <div className="grid gap-2">
      <ul className="divide-border grid max-h-80 divide-y overflow-y-auto">
        {group.items.map(({ landing, date }) => {
          const { entry } = landing
          const installment = installmentLabel(landing)
          return (
            <li
              key={`${entry.id}:${landing.competence}:${landing.part?.id ?? ''}`}
              className="flex items-center gap-2 py-2"
            >
              <span
                className={cn(
                  'w-10 shrink-0 text-xs tabular-nums',
                  group.key === 'overdue'
                    ? 'text-destructive font-medium'
                    : 'text-muted-foreground',
                )}
              >
                {date.slice(8, 10)}/{date.slice(5, 7)}
              </span>
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => openEdit(targetFor(data, landing))}
              >
                <span className="block truncate text-sm">
                  {entry.description}
                  {installment !== null && (
                    <span className="text-muted-foreground"> · {installment}</span>
                  )}
                  {landing.part !== null && (
                    <span className="text-muted-foreground"> · {landing.part.label}</span>
                  )}
                </span>
                <span className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-muted-foreground min-w-0 truncate">
                    {entry.kind === 'transfer'
                      ? `${label(entry.accountId)} → ${label(entry.toAccountId)}`
                      : label(entry.accountId)}
                  </span>
                  {entry.kind === 'transfer' ? (
                    <Money cents={landing.amountCents} className="shrink-0" />
                  ) : (
                    <Money
                      cents={entry.kind === 'income' ? landing.amountCents : -landing.amountCents}
                      tone
                      className="shrink-0"
                    />
                  )}
                </span>
              </button>
              <div className="shrink-0">
                <PayButton landing={landing} />
              </div>
            </li>
          )
        })}
      </ul>
      <p className="text-muted-foreground text-xs">
        {[
          group.expenseCents > 0 && `A pagar ${formatMoney(group.expenseCents)}`,
          group.incomeCents > 0 && `A receber ${formatMoney(group.incomeCents)}`,
          group.transferCents > 0 && `Transferências ${formatMoney(group.transferCents)}`,
        ]
          .filter((p) => p !== false)
          .join(' · ')}
      </p>
    </div>
  )
}

/**
 * "Próximas contas": the unpaid occurrences by urgency in one widget, one tab
 * per window (each with its count, overdue in red), opening on the most
 * urgent one that has anything. Paying is one click.
 */
export function UpcomingBills({ data, today }: { data: LedgerData; today: string }) {
  const groups = useMemo(() => {
    const window = payablesWindow(data.countFrom, today.slice(0, 7))
    const landings = projectWindow(data, window.from, window.to).flatMap((m) => m.landings)
    return groupPayables(landings, data.payments, today)
  }, [data, today])
  const byKey = new Map(groups.map((g) => [g.key, g]))

  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle asChild>
          <h2>Próximas contas</h2>
        </CardTitle>
        <CardDescription>O que falta pagar ou receber, por urgência.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue={initialTab(groups)}>
          <TabsList className="w-full justify-start overflow-x-auto">
            {TABS.map((tab) => {
              const count = byKey.get(tab.key)?.items.length ?? 0
              return (
                <TabsTrigger key={tab.key} value={tab.key} className="gap-1.5 px-1.5 text-xs">
                  {tab.label}
                  {count > 0 && (
                    <Badge
                      variant={tab.key === 'overdue' ? 'destructive' : 'secondary'}
                      className="h-4 min-w-4 px-1 text-[10px] tabular-nums"
                    >
                      {count}
                    </Badge>
                  )}
                </TabsTrigger>
              )
            })}
          </TabsList>
          {TABS.map((tab) => {
            const group = byKey.get(tab.key)
            return (
              <TabsContent key={tab.key} value={tab.key} className="pt-2">
                {group === undefined ? (
                  <EmptyState title={tab.empty} className="py-6" />
                ) : (
                  <BillList group={group} data={data} />
                )}
              </TabsContent>
            )
          })}
        </Tabs>
      </CardContent>
    </Card>
  )
}
