'use client'

import { deleteEntryAction } from '@/features/ledger/adapters/actions/entries'
import { markPaidAction, unmarkPaidAction } from '@/features/ledger/adapters/actions/payments'
import { accountLabel } from '@/features/ledger/core/account-filter'
import { isMovable } from '@/features/ledger/core/calendar'
import { deleteMonthOf } from '@/features/ledger/core/entry-form'
import {
  dayLongLabel,
  formatAmount,
  formatMoney,
  isoDate,
  monthLabel,
} from '@/features/ledger/core/format'
import {
  paidLabel,
  POT_COLORS,
  POT_LABELS,
  potTint,
  RECURRENCE_LABELS,
} from '@/features/ledger/core/labels'
import type { Landing } from '@/features/ledger/core/occurrence'
import {
  paymentFor,
  paymentKeyOf,
  paymentStatus,
  type PaymentStatus,
} from '@/features/ledger/core/payments'
import { installmentLabel, targetFor, type LedgerData } from '@/features/ledger/core/view'
import { Button, cn, Popover, PopoverContent, PopoverTrigger } from '@cbrl/design'
import {
  Banknote,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  EyeOff,
  Hash,
  Pencil,
  Tag,
  Trash2,
  Wallet,
  X,
} from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useLedgerUi } from '../ledger-shell'
import { POPUP_CLASS, POPUP_PLACEMENT, useCalendar, usePopupSide } from './context'

/** "Aluguel" or "Salário · Adiantamento". */
export function landingTitle(landing: Landing): string {
  return landing.part === null
    ? landing.entry.description
    : `${landing.entry.description} · ${landing.part.label}`
}

/** Color square/dot of an entry: its pot, green for income, blue for transfers. */
export function entryColor(landing: Landing): string {
  const { entry } = landing
  if (entry.kind === 'income') return 'bg-emerald-500 dark:bg-emerald-400'
  if (entry.kind === 'transfer' || entry.pot === null) return 'bg-sky-500 dark:bg-sky-400'
  return POT_COLORS[entry.pot]
}

function chipColors(landing: Landing): string | undefined {
  const { entry } = landing
  if (entry.kind === 'income') return 'bg-emerald-500/15 text-emerald-900 dark:text-emerald-200'
  if (entry.kind === 'transfer') return 'bg-sky-500/15 text-sky-900 dark:text-sky-200'
  return potTint(entry.pot) ?? 'bg-muted'
}

const STATUS_TITLES: Record<PaymentStatus, (kind: Landing['entry']['kind']) => string> = {
  paid: (kind) => (kind === 'income' ? 'recebido' : 'pago'),
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
  const statusTitle = skipped ? 'ignorado' : STATUS_TITLES[status](landing.entry.kind)
  const title = landingTitle(landing)
  const movable = !skipped && isMovable(landing)
  const amount = formatAmount(landing.amountCents)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => measureSide(e.currentTarget)}
          title={`${title} ${formatMoney(landing.amountCents)}${statusTitle === '' ? '' : ` (${statusTitle})`}`}
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
              ? cn('h-5 rounded px-1.5 text-xs leading-5', chipColors(landing))
              : 'hover:bg-muted rounded-md px-2 py-1.5 text-sm',
            movable && 'cursor-grab active:cursor-grabbing',
            status === 'paid' && 'opacity-50',
            status === 'overdue' && 'ring-destructive text-destructive ring-1 ring-inset',
            skipped && 'text-muted-foreground bg-transparent line-through opacity-70',
            dragged === landing && 'opacity-40',
          )}
        >
          {variant === 'row' && (
            <span className={cn('size-2.5 shrink-0 rounded-full', entryColor(landing))} />
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
              <span className="w-28 shrink-0 text-right font-medium tabular-nums">{amount}</span>
              <span className="truncate">{title}</span>
            </>
          )}
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
  const { openEdit, requestScope } = useLedgerUi()
  const [pending, startTransition] = useTransition()
  const { entry } = landing
  const target = targetFor(data, landing)
  const payment = paymentFor(landing, data.payments)
  const status = paymentStatus(landing, data.payments, today)
  const label = paidLabel(entry.kind)

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
      toast.success('Lançamento excluído.')
      onClose()
    })
  }

  function togglePaid() {
    startTransition(async () => {
      const key = paymentKeyOf(landing)
      const result = payment === undefined ? await markPaidAction(key) : await unmarkPaidAction(key)
      if (!result.ok) toast.error(result.error)
    })
  }

  const rows = detailRows(landing, data, statusLine({ landing, skipped, payment, status, today }))

  return (
    <div className="grid gap-3 p-2 pb-5" aria-label={`Detalhes de ${landingTitle(landing)}`}>
      <div className="flex justify-end gap-0.5">
        <Button variant="ghost" size="icon-sm" aria-label="Editar lançamento" onClick={edit}>
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Excluir lançamento"
          disabled={pending}
          onClick={() => void remove()}
        >
          <Trash2 />
        </Button>
        {!skipped && (
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
            <CircleCheck className={cn(payment !== undefined && 'text-emerald-600')} />
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" aria-label="Fechar" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="grid grid-cols-[1.25rem_1fr] items-start gap-x-4 gap-y-3 px-4">
        <span className={cn('mt-2 size-3.5 rounded-sm', entryColor(landing))} aria-hidden />
        <div className="min-w-0">
          <h3 className={cn('text-xl leading-snug', skipped && 'line-through')}>
            {landingTitle(landing)}
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

/** `-R$ 10,00` for expenses, `+R$ 10,00` for income, plain for transfers. */
function signedAmount(landing: Landing): string {
  const money = formatMoney(landing.amountCents)
  if (landing.entry.kind === 'income') return `+${money}`
  if (landing.entry.kind === 'expense') return `-${money}`
  return money
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
  const kind = landing.entry.kind
  if (skipped)
    return { icon: EyeOff, label: 'Situação', text: 'Ignorado neste mês: não conta no saldo' }
  if (status === 'paid') {
    return {
      icon: CircleCheck,
      label: 'Situação',
      text: `${paidLabel(kind)} em ${dayLongLabel(payment?.paidOn ?? today)}`,
    }
  }
  if (status === 'overdue') return { icon: CircleAlert, label: 'Situação', text: 'Atrasada' }
  return {
    icon: CircleDashed,
    label: 'Situação',
    text: kind === 'income' ? 'A receber' : 'A pagar',
  }
}

/** Amount, account(s), category/pot, status and tags of the popup. */
function detailRows(
  landing: Landing,
  data: Pick<LedgerData, 'accounts' | 'banks' | 'categories'>,
  status: Row,
): Row[] {
  const { entry } = landing
  const account = (id: string | null) => accountLabel(id, data.accounts, data.banks)
  const category = data.categories.find((c) => c.id === entry.categoryId)?.name
  const pot = entry.pot === null ? undefined : `pote ${POT_LABELS[entry.pot]}`
  const classification = [category, pot].filter((part) => part !== undefined).join(' · ')
  return [
    { icon: Banknote, label: 'Valor', text: signedAmount(landing) },
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
