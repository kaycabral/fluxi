'use client'

import { accountLabel } from '@/features/ledger/core/account-filter'
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
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  EmptyState,
  Tabs,
  TabsContent,
  TabsCount,
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
    <div className="flex h-full min-h-0 flex-col gap-2">
      <ul className="divide-border @container -mr-2 min-h-0 flex-1 divide-y overflow-y-auto pr-2">
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
                    <Money cents={Math.abs(landing.amountCents)} className="shrink-0" />
                  ) : (
                    <Money cents={landing.amountCents} tone className="shrink-0" />
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
    </div>
  )
}

/**
 * "Contas": the unpaid occurrences by urgency in one widget, one tab
 * per window (each with its count, overdue in red), opening on the most
 * urgent one that has anything. Paying is one click.
 */
export function UpcomingBills({
  data,
  today,
  className,
}: {
  data: LedgerData
  today: string
  className?: string
}) {
  const groups = useMemo(() => {
    const window = payablesWindow(today.slice(0, 7))
    const landings = projectWindow(data, window.from, window.to).flatMap((m) => m.landings)
    return groupPayables(landings, data.payments, today)
  }, [data, today])
  const byKey = new Map(groups.map((g) => [g.key, g]))

  return (
    // Fixed height when stacked; beside the budget (lg) it takes the row's height
    // and never grows it (`contain-size`), scrolling its list instead.
    <Card className={cn('h-[30rem] min-w-0 lg:h-auto lg:contain-size', className)}>
      <CardHeader>
        <CardTitle asChild>
          <h2>Contas</h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        <Tabs defaultValue={initialTab(groups)} className="h-full gap-3">
          <TabsList variant="line">
            {TABS.map((tab) => {
              const count = byKey.get(tab.key)?.items.length ?? 0
              return (
                <TabsTrigger key={tab.key} value={tab.key}>
                  {tab.label}
                  {count > 0 && (
                    <TabsCount tone={tab.key === 'overdue' ? 'destructive' : 'default'}>
                      {count}
                    </TabsCount>
                  )}
                </TabsTrigger>
              )
            })}
          </TabsList>
          {TABS.map((tab) => {
            const group = byKey.get(tab.key)
            return (
              <TabsContent key={tab.key} value={tab.key} className="min-h-0">
                {group === undefined ? (
                  <EmptyState title={tab.empty} className="h-full justify-center py-6" />
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
