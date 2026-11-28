'use client'

import { deleteEntryAction } from '@/features/ledger/adapters/actions/entries'
import { markPaidAction, unmarkPaidAction } from '@/features/ledger/adapters/actions/payments'
import { accountLabel } from '@/features/ledger/core/account-filter'
import { isMovable } from '@/features/ledger/core/calendar'
import { deleteMonthOf } from '@/features/ledger/core/entry-form'
import {
  dayLongLabel,
  formatMoney,
  formatSignedMoney,
  isoDate,
  monthLabel,
} from '@/features/ledger/core/format'
import {
  budgetGroupDot,
  budgetGroupName,
  budgetGroupTint,
  paidLabel,
  RECURRENCE_LABELS,
} from '@/features/ledger/core/labels'
import type { Landing } from '@/features/ledger/core/occurrence'
import {
  paymentFor,
  paymentKeyOf,
  paymentStatus,
  type PaymentStatus,
} from '@/features/ledger/core/payments'
import type { BudgetGroup } from '@/features/ledger/core/types'
import { installmentLabel, targetFor, type LedgerData } from '@/features/ledger/core/view'
import { formatAmountFromCents } from '@cbrl/br/money'
import { Button, cn, Popover, PopoverContent, PopoverTrigger } from '@cbrl/design'
import {
  Banknote,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  EyeOff,
  Hash,
  Pencil,
  Store,
  Tag,
  Trash2,
  Wallet,
  X,
} from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { BANK_MARK_LABEL, BankMark } from '../bank-mark'
import { useLedgerUi } from '../ledger-shell'
import { toneOf } from '../money'
import { paidMessage } from '../paid-controls'
import { POPUP_CLASS, POPUP_PLACEMENT, useCalendar, usePopupSide } from './context'

/** "Aluguel" or "Salário · Adiantamento". */
export function landingTitle(landing: Landing): string {
  return landing.part === null
    ? landing.entry.description
    : `${landing.entry.description} · ${landing.part.label}`
}

/** Color square/dot of an entry: its budget group, green for income, blue for transfers. */
export function entryColor(landing: Landing, budgetGroups: readonly BudgetGroup[]): string {
  const { entry } = landing
  if (entry.kind === 'income') return 'bg-positive'
  if (entry.kind === 'transfer' || entry.budgetGroup === null) return 'bg-info'
  return budgetGroupDot(entry.budgetGroup, budgetGroups)
}

function chipColors(landing: Landing, budgetGroups: readonly BudgetGroup[]): string | undefined {
  const { entry } = landing
  if (entry.kind === 'income') return 'bg-success-muted text-success-muted-foreground'
  if (entry.kind === 'transfer') return 'bg-info-muted text-info-muted-foreground'
  return budgetGroupTint(entry.budgetGroup, budgetGroups) ?? 'bg-muted'
}

const STATUS_TITLES: Record<PaymentStatus, (amountCents: number) => string> = {
  paid: (amountCents) => (amountCents > 0 ? 'recebido' : 'pago'),
  overdue: () => 'atrasada',
  upcoming: () => '',
}

/**
 * One occurrence in the calendar (like a Google Calendar event): a fixed-height
 * chip, or a schedule row. Clicking opens its details; whole occurrences drag to
 * another day. Paid ones are faded, overdue ones outlined, ignored ones struck.
 */
export function EventChip({
  landing,
  skipped = false,
  variant = 'chip',
}: {
  landing: Landing
  skipped?: boolean
  variant?: 'chip' | 'row'
}) {
  const { data, today, dragged, setDragged } = useCalendar()
  const [open, setOpen] = useState(false)
  const [side, measureSide] = usePopupSide()
  const status = skipped ? 'upcoming' : paymentStatus(landing, data.payments, today)
  const statusTitle = skipped ? 'ignorado' : STATUS_TITLES[status](landing.amountCents)
  const title = landingTitle(landing)
  const movable = !skipped && isMovable(landing)
  const amount = formatAmountFromCents(chipCents(landing))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => measureSide(e.currentTarget)}
          title={`${title}${landing.entry.merchantName === null ? '' : ` · ${landing.entry.merchantName}`} ${signedAmount(landing)}${statusTitle === '' ? '' : ` (${statusTitle})`}${landing.entry.fromBank ? ` · ${BANK_MARK_LABEL}` : ''}`}
          draggable={movable}
          onDragStart={(e) => {
            // Firefox only starts a drag with data set.
            e.dataTransfer.setData('text/plain', title)
            e.dataTransfer.effectAllowed = 'move'
            setDragged(landing)
          }}
          onDragEnd={() => setDragged(null)}
          className={cn(
            'relative flex w-full min-w-0 items-center gap-1.5 text-left',
            variant === 'chip'
              ? cn('h-5 rounded px-1.5 text-xs leading-5', chipColors(landing, data.budgetGroups))
              : 'hover:bg-muted rounded-md px-2 py-1.5 text-sm',
            movable && 'cursor-grab active:cursor-grabbing',
            status === 'paid' && 'opacity-50',
            status === 'overdue' && 'ring-destructive text-destructive ring-1 ring-inset',
            skipped && 'text-muted-foreground bg-transparent line-through opacity-70',
            dragged === landing && 'opacity-40',
          )}
        >
          {variant === 'row' && (
            <span
              className={cn(
                'size-2.5 shrink-0 rounded-full',
                entryColor(landing, data.budgetGroups),
              )}
            />
          )}
          {status === 'paid' && (
            <CircleCheck className="size-3 shrink-0" aria-label={statusTitle} />
          )}
          {variant === 'chip' ? (
            <span className="truncate">
              <span className="font-medium tabular-nums">{amount}</span> {title}
            </span>
          ) : (
            <>
              <span
                className={cn(
                  'w-28 shrink-0 text-right font-medium tabular-nums',
                  status !== 'overdue' &&
                    !skipped &&
                    landing.entry.kind !== 'transfer' &&
                    toneOf(landing.amountCents),
                )}
              >
                {amount}
              </span>
              <span className="truncate">{title}</span>
            </>
          )}
          {landing.entry.fromBank && <BankMark tooltip={false} />}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={side}
        align="start"
        {...POPUP_PLACEMENT}
        className={cn('w-[min(26rem,calc(100vw-2rem))] p-0', POPUP_CLASS)}
      >
        <EventDetails landing={landing} skipped={skipped} onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}

/** The event popup: actions on top, then title, date and one row per detail. */
export function EventDetails({
  landing,
  skipped,
  onClose,
}: {
  landing: Landing
  skipped: boolean
  onClose: () => void
}) {
  const { data, today } = useCalendar()
  const { openEdit, requestScope, offerUndo } = useLedgerUi()
  const [pending, startTransition] = useTransition()
  const { entry } = landing
  const target = targetFor(data, landing)
  const payment = paymentFor(landing, data.payments)
  const status = paymentStatus(landing, data.payments, today)
  const label = paidLabel(landing.amountCents)

  function edit() {
    onClose()
    openEdit(target)
  }

  async function remove() {
    const month = deleteMonthOf(target)
    let scope: 'one' | 'future' | 'all' = 'all'
    if (month !== null) {
      const chosen = await requestScope({
        kind: 'delete',
        description: `${entry.description} em ${monthLabel(month)}`,
      })
      if (chosen === null) return
      scope = chosen
    }
    startTransition(async () => {
      const result = await deleteEntryAction({ entryId: entry.id, month, scope })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      offerUndo(result, 'Transação excluída.')
      onClose()
    })
  }

  function togglePaid() {
    startTransition(async () => {
      const key = paymentKeyOf(landing)
      const marking = payment === undefined
      const result = marking ? await markPaidAction(key) : await unmarkPaidAction(key)
      if (!result.ok) toast.error(result.error)
      else offerUndo(result, paidMessage(landing.amountCents, marking))
    })
  }

  const rows = detailRows(landing, data, statusLine({ landing, skipped, payment, status, today }))

  return (
    <div className="grid gap-3 p-2 pb-5" aria-label={`Detalhes de ${landingTitle(landing)}`}>
      <div className="flex justify-end gap-0.5">
        <Button variant="ghost" size="icon-sm" aria-label="Editar transação" onClick={edit}>
          <Pencil />
        </Button>
        {!entry.fromBank && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Excluir transação"
            disabled={pending}
            onClick={() => void remove()}
          >
            <Trash2 />
          </Button>
        )}
        {!skipped && !entry.fromBank && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={
              payment === undefined
                ? `Marcar como ${label.toLowerCase()}`
                : `Desmarcar ${label.toLowerCase()}`
            }
            aria-pressed={payment !== undefined}
            disabled={pending}
            onClick={togglePaid}
          >
            <CircleCheck className={cn(payment !== undefined && 'text-success')} />
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" aria-label="Fechar" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="grid grid-cols-[1.25rem_1fr] items-start gap-x-4 gap-y-3 px-4">
        <span
          className={cn('mt-2 size-3.5 rounded-sm', entryColor(landing, data.budgetGroups))}
          aria-hidden
        />
        <div className="min-w-0">
          <h3 className={cn('text-xl leading-snug', skipped && 'line-through')}>
            {landingTitle(landing)}
            {entry.fromBank && <BankMark className="ml-2" />}
          </h3>
          <p className="text-muted-foreground text-sm first-letter:uppercase">
            {dayLongLabel(isoDate(landing.month, landing.day))} · {repeatLabel(landing)}
          </p>
        </div>
        {rows.map((row) => (
          <RowLine key={row.label} icon={row.icon} label={row.label} text={row.text} />
        ))}
      </div>
    </div>
  )
}

/** "Não se repete", "Todo mês", "Parcelado · parcela 2/10". */
function repeatLabel(landing: Landing): string {
  const { recurrence } = landing.entry
  if (recurrence === 'none') return 'Não se repete'
  const installment = installmentLabel(landing)
  return installment === null
    ? RECURRENCE_LABELS[recurrence]
    : `${RECURRENCE_LABELS[recurrence]} · parcela ${installment}`
}

/** What a chip shows: the signed amount, a transfer's magnitude (its accounts show the way). */
function chipCents(landing: Landing): number {
  return landing.entry.kind === 'transfer' ? Math.abs(landing.amountCents) : landing.amountCents
}

/** `-R$ 10,00` out, `+R$ 10,00` in; transfers plain. */
function signedAmount(landing: Landing): string {
  const cents = chipCents(landing)
  return landing.entry.kind === 'transfer' ? formatMoney(cents) : formatSignedMoney(cents)
}

type Row = { icon: React.ComponentType<{ className?: string }>; label: string; text: string }

function statusLine(input: {
  landing: Landing
  skipped: boolean
  payment: { paidOn: string } | undefined
  status: PaymentStatus
  today: string
}): Row {
  const { landing, skipped, payment, status, today } = input
  const inflow = landing.amountCents > 0
  if (skipped)
    return { icon: EyeOff, label: 'Situação', text: 'Ignorado neste mês: não conta no saldo' }
  if (status === 'paid') {
    const bank = landing.entry.fromBank ? ' (vem do banco)' : ''
    return {
      icon: CircleCheck,
      label: 'Situação',
      text: `${paidLabel(landing.amountCents)} em ${dayLongLabel(payment?.paidOn ?? today)}${bank}`,
    }
  }
  if (status === 'overdue') return { icon: CircleAlert, label: 'Situação', text: 'Atrasada' }
  return {
    icon: CircleDashed,
    label: 'Situação',
    text: inflow ? 'A receber' : 'A pagar',
  }
}

/** Amount, account(s), category/budget group, status and tags of the popup. */
function detailRows(
  landing: Landing,
  data: Pick<LedgerData, 'accounts' | 'banks' | 'categories' | 'budgetGroups'>,
  status: Row,
): Row[] {
  const { entry } = landing
  const account = (id: string | null) => accountLabel(id, data.accounts, data.banks)
  const category = data.categories.find((c) => c.id === entry.categoryId)?.name
  const budgetGroup =
    entry.budgetGroup === null
      ? undefined
      : `grupo ${budgetGroupName(entry.budgetGroup, data.budgetGroups)}`
  const classification = [category, budgetGroup].filter((part) => part !== undefined).join(' · ')
  return [
    { icon: Banknote, label: 'Valor', text: signedAmount(landing) },
    ...(entry.merchantName === null
      ? []
      : [{ icon: Store, label: 'Estabelecimento', text: entry.merchantName }]),
    {
      icon: Wallet,
      label: 'Conta',
      text:
        entry.kind === 'transfer'
          ? `${account(entry.accountId)} → ${account(entry.toAccountId)}`
          : account(entry.accountId),
    },
    ...(classification === '' ? [] : [{ icon: Tag, label: 'Categoria', text: classification }]),
    status,
    ...(entry.tags.length === 0
      ? []
      : [{ icon: Hash, label: 'Tags', text: entry.tags.map((t) => `#${t}`).join(' ') }]),
  ]
}

function RowLine({
  icon: Icon,
  label,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  text: string
}) {
  return (
    <>
      <Icon className="text-muted-foreground size-5" aria-hidden />
      <p className="min-w-0 text-sm leading-5">
        <span className="sr-only">{label}: </span>
        {text}
      </p>
    </>
  )
}
