'use client'

import { formatAmount, monthLabel } from '@/features/ledger/core/format'
import { ACCOUNT_TYPE_LABELS } from '@/features/ledger/core/labels'
import type { Month } from '@/features/ledger/core/month'
import { sumBalances } from '@/features/ledger/core/timeline'
import { projectWindow, type LedgerData } from '@/features/ledger/core/view'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  EmptyState,
} from '@cbrl/design'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { MonthDetail } from './month-detail'

type Props = {
  data: LedgerData
  window: { from: Month; to: Month }
  /** `YYYY-MM`. */
  today: Month
}

const cellClass =
  'px-2 py-1.5 text-right font-mono text-xs whitespace-nowrap tabular-nums sm:text-sm'
const firstColClass = 'bg-card sticky left-0 z-10 px-2 py-1.5 text-left whitespace-nowrap'

function ValueCell({ cents, tone = false }: { cents: number; tone?: boolean }) {
  return (
    <td className={cn(cellClass, tone && cents < 0 && 'text-destructive')}>
      {formatAmount(cents)}
    </td>
  )
}

/** "Mês a mês": totals, total and per-bank balances per month; a month opens its day-by-day detail. */
export function TimelineView({ data, window, today }: Props) {
  const months = useMemo(
    () => projectWindow(data, window.from, window.to),
    [data, window.from, window.to],
  )
  const [selected, setSelected] = useState(today)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const selectedResult = months.find((m) => m.month === selected)

  const active = data.accounts.filter((a) => !a.archived)
  const activeIds = active.map((a) => a.id)

  if (data.accounts.length === 0) {
    return (
      <EmptyState
        title="Cadastre seu primeiro banco e conta"
        description="A linha do tempo projeta o saldo das suas contas mês a mês. Comece cadastrando onde seu dinheiro está."
        action={{ label: 'Ir para Bancos e contas', href: '/painel/contas' }}
      />
    )
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle asChild>
            <h2>Mês a mês</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b">
                  <th className={cn(firstColClass, 'text-muted-foreground font-normal')}>
                    <span className="sr-only">Linha</span>
                  </th>
                  {months.map((m) => (
                    <th key={m.month} className="px-1 py-1 text-right">
                      <Button
                        variant="ghost"
                        size="xs"
                        aria-pressed={m.month === selected}
                        className={cn(
                          'font-medium',
                          m.month === selected && 'text-primary bg-primary/10',
                        )}
                        onClick={() => setSelected(m.month)}
                      >
                        {monthLabel(m.month)}
                      </Button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className={firstColClass}>
                    <span
                      className="mr-1.5 inline-block size-2 rounded-xs bg-emerald-600"
                      aria-hidden
                    />
                    Entradas
                  </td>
                  {months.map((m) => (
                    <ValueCell key={m.month} cents={m.totals.incomeCents} />
                  ))}
                </tr>
                <tr className="border-b">
                  <td className={firstColClass}>
                    <span
                      className="bg-destructive mr-1.5 inline-block size-2 rounded-xs"
                      aria-hidden
                    />
                    Saídas
                  </td>
                  {months.map((m) => (
                    <ValueCell key={m.month} cents={-m.totals.expenseCents} />
                  ))}
                </tr>
                <tr className="border-foreground/20 border-t border-b font-semibold">
                  <td className={firstColClass}>Resultado do mês</td>
                  {months.map((m) => (
                    <ValueCell key={m.month} cents={m.totals.netCents} tone />
                  ))}
                </tr>
                <tr className="bg-primary/10 border-b font-semibold">
                  <td
                    className={cn(
                      firstColClass,
                      'bg-[color-mix(in_oklab,var(--primary)_10%,var(--card))]',
                    )}
                  >
                    Saldo total
                  </td>
                  {months.map((m) => (
                    <ValueCell
                      key={m.month}
                      cents={sumBalances(m.closingBalances, activeIds)}
                      tone
                    />
                  ))}
                </tr>
                {data.banks.map((bank) => {
                  const accounts = active.filter((a) => a.bankId === bank.id)
                  if (accounts.length === 0) return null
                  const open = expanded[bank.id] === true
                  return [
                    <tr key={bank.id} className="border-b font-medium">
                      <td className={firstColClass}>
                        <button
                          type="button"
                          className="hover:text-primary inline-flex items-center gap-1"
                          aria-expanded={open}
                          aria-label={`Mostrar contas de ${bank.name}`}
                          onClick={() => setExpanded((e) => ({ ...e, [bank.id]: !open }))}
                        >
                          {open ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                          <span aria-hidden>{bank.name}</span>
                        </button>
                      </td>
                      {months.map((m) => (
                        <ValueCell
                          key={m.month}
                          cents={sumBalances(
                            m.closingBalances,
                            accounts.map((a) => a.id),
                          )}
                          tone
                        />
                      ))}
                    </tr>,
                    ...(open
                      ? accounts.map((account) => (
                          <tr key={account.id} className="text-muted-foreground border-b">
                            <td className={cn(firstColClass, 'pl-8')}>
                              {account.name}{' '}
                              <Badge variant="outline" className="ml-1">
                                {ACCOUNT_TYPE_LABELS[account.type]}
                              </Badge>
                            </td>
                            {months.map((m) => (
                              <ValueCell
                                key={m.month}
                                cents={sumBalances(m.closingBalances, [account.id])}
                                tone
                              />
                            ))}
                          </tr>
                        ))
                      : []),
                  ]
                })}
              </tbody>
            </table>
          </div>
          <p className="text-muted-foreground text-xs">
            Cada conta começa com o saldo inicial cadastrado em Bancos e contas e soma todas as
            transações desde a primeira.
          </p>
        </CardContent>
      </Card>
      {selectedResult !== undefined && (
        <MonthDetail key={selectedResult.month} result={selectedResult} data={data} />
      )}
    </div>
  )
}
