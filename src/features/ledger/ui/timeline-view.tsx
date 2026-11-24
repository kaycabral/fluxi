'use client'

import { setCountFromAction } from '@/features/ledger/adapters/actions/settings'
import { INITIAL_FORM_STATE } from '@/features/ledger/core/action-result'
import { bucketOfType } from '@/features/ledger/core/bucket'
import { formatCompactMoney, monthLabel } from '@/features/ledger/core/format'
import { ACCOUNT_TYPE_LABELS } from '@/features/ledger/core/labels'
import { monthRange, type Month } from '@/features/ledger/core/month'
import type { MonthResult } from '@/features/ledger/core/projection'
import { initialSelectedMonth, sumBalances } from '@/features/ledger/core/timeline'
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
  Label,
} from '@cbrl/design'
import { ChevronDown, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { startTransition, useActionState, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { MonthDetail } from './month-detail'
import { MonthSelect } from './selects'

type Props = {
  data: LedgerData
  window: { from: Month; to: Month }
  /** `YYYY-MM`. */
  today: Month
}

const cellClass =
  'px-2 py-1.5 text-right font-mono text-xs whitespace-nowrap tabular-nums sm:text-sm'
const firstColClass = 'bg-card sticky left-0 z-10 px-2 py-1.5 text-left whitespace-nowrap'

function ValueCell({
  result,
  cents,
  tone = false,
}: {
  result: MonthResult
  cents: number | null
  tone?: boolean
}) {
  return (
    <td
      className={cn(
        cellClass,
        !result.counted && 'text-muted-foreground opacity-50',
        tone && cents !== null && cents < 0 && 'text-destructive',
      )}
    >
      {cents === null ? '–' : formatCompactMoney(cents)}
    </td>
  )
}

function CountFromForm({
  value,
  months,
  onSaved,
}: {
  value: Month | null
  months: Month[]
  onSaved: (m: Month) => void
}) {
  const [state, formAction, pending] = useActionState(setCountFromAction, INITIAL_FORM_STATE)
  const [current, setCurrent] = useState(value ?? '')
  useEffect(() => {
    if (state.error !== null) toast.error(state.error)
  }, [state])

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2 text-sm">
      <Label htmlFor="count-from">Contar a partir de</Label>
      <MonthSelect
        id="count-from"
        name="month"
        className="w-28"
        months={months}
        value={current}
        disabled={pending}
        onValueChange={(month) => {
          setCurrent(month)
          onSaved(month)
          const formData = new FormData()
          formData.set('month', month)
          startTransition(() => formAction(formData))
        }}
      />
      <span className="text-muted-foreground text-xs">
        saldos iniciais em{' '}
        <Link href="/painel/contas" className="text-primary underline-offset-2 hover:underline">
          Bancos e contas
        </Link>
      </span>
    </form>
  )
}

/** "Mês a mês": totals, total and per-bank balances per month; a month opens its day-by-day detail. */
export function TimelineView({ data, window, today }: Props) {
  const months = useMemo(
    () => projectWindow(data, window.from, window.to),
    [data, window.from, window.to],
  )
  const options = useMemo(() => monthRange(window.from, window.to), [window.from, window.to])
  const [selected, setSelected] = useState(() => initialSelectedMonth(data.countFrom, today))
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const selectedResult = months.find((m) => m.month === selected) ?? months[0]

  const activeAccounts = data.accounts.filter((a) => !a.archived)
  // Decision rows use available money only; benefits get their own block below.
  const active = activeAccounts.filter((a) => bucketOfType(a.type) === 'available')
  const activeIds = active.map((a) => a.id)
  const benefits = activeAccounts.filter((a) => bucketOfType(a.type) === 'benefit')
  const benefitIds = benefits.map((a) => a.id)
  const bankName = (bankId: string) => data.banks.find((b) => b.id === bankId)?.name
  const countFromLabel = monthLabel(data.countFrom ?? window.from)

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
          <CountFromForm
            value={data.countFrom}
            months={options}
            onSaved={(month) => setSelected((current) => (current < month ? month : current))}
          />
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
                          !m.counted && 'opacity-50',
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
                    <ValueCell key={m.month} result={m} cents={m.byBucket.available.incomeCents} />
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
                    <ValueCell
                      key={m.month}
                      result={m}
                      cents={-m.byBucket.available.expenseCents}
                    />
                  ))}
                </tr>
                <tr className="border-foreground/20 border-t border-b font-semibold">
                  <td className={firstColClass}>Resultado do mês</td>
                  {months.map((m) => (
                    <ValueCell
                      key={m.month}
                      result={m}
                      cents={m.byBucket.available.netCents}
                      tone
                    />
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
                      result={m}
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
                          result={m}
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
                                result={m}
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
              {benefits.length > 0 && (
                <tbody className="text-muted-foreground" aria-label="Benefícios">
                  <tr className="border-t-foreground/20 border-t border-b font-medium">
                    <td className={firstColClass}>
                      Benefícios <span className="text-xs font-normal">(fora do saldo total)</span>
                    </td>
                    {months.map((m) => (
                      <ValueCell
                        key={m.month}
                        result={m}
                        cents={sumBalances(m.closingBalances, benefitIds)}
                      />
                    ))}
                  </tr>
                  {benefits.map((account) => {
                    const bank = bankName(account.bankId)
                    return (
                      <tr key={account.id} className="border-b">
                        <td className={cn(firstColClass, 'pl-6')}>
                          {bank === undefined ? account.name : `${bank} · ${account.name}`}
                        </td>
                        {months.map((m) => (
                          <ValueCell
                            key={m.month}
                            result={m}
                            cents={sumBalances(m.closingBalances, [account.id])}
                          />
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              )}
            </table>
          </div>
          <p className="text-muted-foreground text-xs">
            Meses antes de {countFromLabel} aparecem apagados e não entram no saldo. Cada conta
            começa com o saldo inicial cadastrado em Bancos e contas. Entradas, saídas e saldo total
            contam só o dinheiro disponível; contas de benefício (VA, VR e afins) aparecem à parte.
          </p>
        </CardContent>
      </Card>
      {selectedResult !== undefined && (
        <MonthDetail key={selectedResult.month} result={selectedResult} data={data} />
      )}
    </div>
  )
}
