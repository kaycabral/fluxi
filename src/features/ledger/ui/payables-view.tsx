'use client'

import { accountLabel } from '@/features/ledger/core/account-filter'
import { formatMoney, shortDate } from '@/features/ledger/core/format'
import type { Month } from '@/features/ledger/core/month'
import { groupPayables, type PayableGroup } from '@/features/ledger/core/payments'
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
  CardHeader,
  CardTitle,
  cn,
  EmptyState,
  Label,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@cbrl/design'
import { useMemo, useState } from 'react'
import { useLedgerUi } from './ledger-shell'
import { Money } from './money'
import { PayButton, UnpayButton } from './paid-controls'

type Props = {
  data: LedgerData
  window: { from: Month; to: Month }
  /** `YYYY-MM-DD`. */
  today: string
}

function GroupTotals({ group }: { group: PayableGroup }) {
  const parts = [
    group.expenseCents > 0 && `Saídas ${formatMoney(group.expenseCents)}`,
    group.incomeCents > 0 && `Entradas ${formatMoney(group.incomeCents)}`,
    group.transferCents > 0 && `Transferências ${formatMoney(group.transferCents)}`,
  ].filter((p) => p !== false)
  return <p className="text-muted-foreground text-sm">{parts.join(' · ')}</p>
}

function GroupCard({ group, data }: { group: PayableGroup; data: LedgerData }) {
  const { openEdit } = useLedgerUi()
  const label = (id: string | null) => accountLabel(id, data.accounts, data.banks)
  const headingId = `payables-${group.key}`
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-baseline justify-between gap-2">
        <CardTitle asChild>
          <h2 id={headingId} className={cn(group.key === 'overdue' && 'text-destructive')}>
            {group.label} <span className="text-muted-foreground">({group.items.length})</span>
          </h2>
        </CardTitle>
        <GroupTotals group={group} />
      </CardHeader>
      <CardContent>
        <Table aria-labelledby={headingId}>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Conta</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Ação</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.items.map(({ landing, status, payment }, index) => {
              const { entry } = landing
              const installment = installmentLabel(landing)
              const sign = entry.kind === 'income' ? 1 : -1
              return (
                <TableRow
                  key={`${entry.id}-${landing.competence}-${landing.part?.id ?? 'whole'}-${index}`}
                >
                  <TableCell
                    className={cn('font-mono', status === 'overdue' && 'text-destructive')}
                  >
                    {shortDate(landing.month, landing.day)}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="hover:text-primary flex items-center gap-1.5 text-left"
                      onClick={() => openEdit(targetFor(data, landing))}
                    >
                      {entry.description}
                      {landing.part !== null && (
                        <Badge variant="outline">{landing.part.label}</Badge>
                      )}
                      {installment !== null && <Badge variant="outline">{installment}</Badge>}
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {entry.kind === 'transfer'
                      ? `${label(entry.accountId)} → ${label(entry.toAccountId)}`
                      : label(entry.accountId)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Money
                      cents={
                        entry.kind === 'transfer' ? landing.amountCents : sign * landing.amountCents
                      }
                      signed={entry.kind !== 'transfer'}
                      tone={entry.kind !== 'transfer'}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {payment === null ? (
                      <PayButton landing={landing} />
                    ) : (
                      <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                        em {shortDate(payment.paidOn.slice(0, 7), Number(payment.paidOn.slice(8)))}
                        <UnpayButton landing={landing} />
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

/** "A pagar": unpaid occurrences by urgency, one click to mark them paid/received. */
export function PayablesView({ data, window, today }: Props) {
  const [includePaid, setIncludePaid] = useState(false)
  const landings = useMemo(
    () => projectWindow(data, window.from, window.to).flatMap((m) => m.landings),
    [data, window.from, window.to],
  )
  const groups = groupPayables(landings, data.payments, today, { includePaid })

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <Switch id="show-paid" checked={includePaid} onCheckedChange={setIncludePaid} />
        <Label htmlFor="show-paid">Mostrar também os pagos deste mês</Label>
      </div>
      {groups.length === 0 ? (
        <EmptyState
          title="Nada a pagar por enquanto"
          description="Contas e recebimentos até o fim do próximo mês aparecem aqui conforme a data chega."
        />
      ) : (
        groups.map((group) => <GroupCard key={group.key} group={group} data={data} />)
      )}
    </div>
  )
}
