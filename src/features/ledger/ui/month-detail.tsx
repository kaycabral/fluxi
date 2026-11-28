'use client'

import { changeDayAction } from '@/features/ledger/adapters/actions/entries'
import { accountLabel, decisionAccountIds } from '@/features/ledger/core/account-filter'
import { isMovable } from '@/features/ledger/core/calendar'
import { describeOccurrenceChange } from '@/features/ledger/core/entry-form'
import { formatMoney, monthLabel } from '@/features/ledger/core/format'
import { budgetGroupTint } from '@/features/ledger/core/labels'
import { paymentStatus } from '@/features/ledger/core/payments'
import { dailyBalance, type DailyRow, type MonthResult } from '@/features/ledger/core/projection'
import type { EditScope } from '@/features/ledger/core/scoped-edit'
import { installmentLabel, targetFor, type LedgerData } from '@/features/ledger/core/view'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@cbrl/design'
import { Plus } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useLedgerUi } from './ledger-shell'
import { Money } from './money'
import { PaidCheckbox } from './paid-controls'
import { AccountSelect } from './selects'

/** Inline day input of a whole (non-split) occurrence; commits on blur or Enter. */
function DayInput({ row, data }: { row: DailyRow; data: LedgerData }) {
  const { requestScope, offerUndo } = useLedgerUi()
  const [pending, startTransition] = useTransition()
  const { landing } = row
  const [value, setValue] = useState(String(landing.day))

  async function commit() {
    const day = Math.max(1, Math.min(31, Number(value) || 1))
    setValue(String(day))
    if (day === landing.day) return
    // Ask before the transition: updates inside an async transition commit only when it ends.
    let scope: EditScope | null = null
    if (landing.entry.recurrence !== 'none') {
      scope = await requestScope({
        kind: 'edit',
        description: describeOccurrenceChange(targetFor(data, landing), landing.competence, {
          day,
        }),
      })
      if (scope === null) {
        setValue(String(landing.day))
        return
      }
    }
    startTransition(async () => {
      const result = await changeDayAction({
        entryId: landing.entry.id,
        month: landing.competence,
        day,
        scope,
      })
      if (!result.ok) {
        toast.error(result.error)
        setValue(String(landing.day))
      } else offerUndo(result, 'Transação movida.')
    })
  }

  return (
    <Input
      type="number"
      min={1}
      max={31}
      inputMode="numeric"
      aria-label={`Dia de ${landing.entry.description}`}
      className="h-8 w-14 px-1 text-center font-mono"
      value={value}
      disabled={pending}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
    />
  )
}

/** "<mês> dia a dia": running balance of the chosen accounts within a month. */
export function MonthDetail({ result, data }: { result: MonthResult; data: LedgerData }) {
  const { openNew, openEdit, refs } = useLedgerUi()
  const [filter, setFilter] = useState('')

  const daily = dailyBalance(result, decisionAccountIds(filter, data.accounts))
  const firstNegative = daily.rows.find((r) => r.balanceAfterCents < 0)
  const label = (id: string | null) => accountLabel(id, data.accounts, data.banks)

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle asChild>
          <h2>{monthLabel(result.month)} dia a dia</h2>
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <AccountSelect
            aria-label="Conta"
            className="w-56"
            banks={data.banks}
            accounts={data.accounts}
            withBanks
            allLabel="Todas as contas"
            value={filter}
            onValueChange={setFilter}
          />
          <Button variant="outline" size="sm" onClick={() => openNew({ month: result.month })}>
            <Plus /> Nova transação
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">começa com {formatMoney(daily.openingCents)}</Badge>
          <Badge
            variant={daily.minBalanceCents < 0 ? 'destructive' : 'secondary'}
            className={cn(daily.minBalanceCents >= 0 && 'text-positive')}
          >
            menor saldo {formatMoney(daily.minBalanceCents)} no dia {daily.minDay}
          </Badge>
          <Badge variant="outline">termina com {formatMoney(daily.closingCents)}</Badge>
        </div>
        {firstNegative !== undefined && (
          <p
            role="status"
            className="border-destructive bg-destructive/10 rounded-r-md border-l-4 px-3 py-2 text-sm"
          >
            O saldo fica negativo no dia {firstNegative.landing.day}. Experimente mudar o dia de
            alguma saída direto na tabela.
          </p>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Dia</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Conta</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-right">Saldo após</TableHead>
              <TableHead className="text-center">Pago</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {daily.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-6 text-center">
                  Nenhuma transação neste mês.
                </TableCell>
              </TableRow>
            )}
            {daily.rows.map((row, index) => {
              const { landing } = row
              const { entry } = landing
              const installment = installmentLabel(landing)
              const category = data.categories.find((c) => c.id === entry.categoryId)
              const status = paymentStatus(landing, data.payments, refs.today)
              return (
                <TableRow
                  key={`${entry.id}-${landing.part?.id ?? 'whole'}-${index}`}
                  tabIndex={0}
                  data-budget-group={entry.budgetGroup ?? undefined}
                  className={cn(
                    'cursor-pointer',
                    budgetGroupTint(entry.budgetGroup, data.budgetGroups),
                    row.balanceAfterCents === daily.minBalanceCents && 'bg-warning-muted',
                  )}
                  onClick={() => openEdit(targetFor(data, landing))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') openEdit(targetFor(data, landing))
                  }}
                >
                  <TableCell>
                    {isMovable(landing) ? (
                      <DayInput
                        key={`${landing.competence}-${landing.day}`}
                        row={row}
                        data={data}
                      />
                    ) : (
                      <span className="font-mono">{String(landing.day).padStart(2, '0')}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5">
                      {entry.description}
                      {landing.part !== null && (
                        <Badge variant="outline">{landing.part.label}</Badge>
                      )}
                      {installment !== null && <Badge variant="outline">{installment}</Badge>}
                      {status === 'overdue' && <Badge variant="destructive">Atrasada</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {entry.kind === 'transfer'
                      ? `${label(entry.accountId)} → ${label(entry.toAccountId)}`
                      : label(entry.accountId)}
                  </TableCell>
                  <TableCell>
                    {entry.kind === 'transfer' ? (
                      <Badge variant="outline">transferência</Badge>
                    ) : (
                      (category?.name ?? '–')
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Money cents={row.effectCents} signed tone />
                  </TableCell>
                  <TableCell className="text-right">
                    <Money
                      cents={row.balanceAfterCents}
                      className={cn(row.balanceAfterCents < 0 && 'text-destructive')}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <PaidCheckbox landing={landing} paid={status === 'paid'} />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
        <p className="text-muted-foreground text-xs">
          Escolha uma conta para ver se ela aguenta o mês sozinha. Mude o dia direto na coluna
          &quot;Dia&quot;.
        </p>
      </CardContent>
    </Card>
  )
}
