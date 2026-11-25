'use client'

import { markPaidAction, unmarkPaidAction } from '@/features/ledger/adapters/actions/payments'
import type { ActionResult } from '@/features/ledger/core/action-result'
import { paidLabel } from '@/features/ledger/core/labels'
import type { Landing } from '@/features/ledger/core/occurrence'
import { paymentKeyOf } from '@/features/ledger/core/payments'
import type { EntryKind } from '@/features/ledger/core/types'
import {
  Button,
  Checkbox,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@cbrl/design'
import { CalendarDays, Check } from 'lucide-react'
import { useId, useOptimistic, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useLedgerUi } from './ledger-shell'

/** "Aluguel" or "Salário (Adiantamento)": names the occurrence in accessible labels. */
export function occurrenceName(landing: Landing): string {
  const { entry, part } = landing
  return part === null ? entry.description : `${entry.description} (${part.label})`
}

/** "Marcado como pago." / "Desmarcado como recebido.": the toast of a payment write. */
export function paidMessage(kind: EntryKind, marked: boolean): string {
  return `${marked ? 'Marcado' : 'Desmarcado'} como ${paidLabel(kind).toLowerCase()}.`
}

/** Mark (`marked`) or unmark one occurrence: errors become toasts, a success offers "Desfazer". */
function usePaymentWrite(landing: Landing) {
  const { offerUndo } = useLedgerUi()
  const [pending, startTransition] = useTransition()
  const run = (marked: boolean, write: () => Promise<ActionResult>) => {
    startTransition(async () => {
      const result = await write()
      if (!result.ok) toast.error(result.error)
      else offerUndo(result, paidMessage(landing.entry.kind, marked))
    })
  }
  return { pending, run }
}

/** Paid checkbox of one occurrence (dia a dia). Optimistic; clicks never reach the row. */
export function PaidCheckbox({ landing, paid }: { landing: Landing; paid: boolean }) {
  const { offerUndo } = useLedgerUi()
  const [, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useOptimistic(paid)
  const label = paidLabel(landing.entry.kind)
  return (
    <Checkbox
      aria-label={`${label}: ${occurrenceName(landing)}`}
      checked={optimistic}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onCheckedChange={(checked) => {
        const next = checked === true
        startTransition(async () => {
          setOptimistic(next)
          const key = paymentKeyOf(landing)
          const result = next ? await markPaidAction(key) : await unmarkPaidAction(key)
          if (!result.ok) toast.error(result.error)
          else offerUndo(result, paidMessage(landing.entry.kind, next))
        })
      }}
    />
  )
}

/** One-click "Pago"/"Recebido" (today) plus a popover to pick another date. */
export function PayButton({ landing }: { landing: Landing }) {
  const { refs } = useLedgerUi()
  const { pending, run } = usePaymentWrite(landing)
  const [date, setDate] = useState(refs.today)
  const [open, setOpen] = useState(false)
  const id = useId()
  const label = paidLabel(landing.entry.kind)
  const name = occurrenceName(landing)
  const key = paymentKeyOf(landing)

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        aria-label={`${label}: ${name}`}
        onClick={() => run(true, () => markPaidAction(key))}
      >
        <Check /> {label}
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={pending}
            aria-label={`Escolher a data: ${name}`}
          >
            <CalendarDays />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="grid w-56 gap-2">
          <Label htmlFor={id}>{label} em</Label>
          <Input
            id={id}
            type="date"
            value={date}
            required
            onChange={(e) => setDate(e.target.value)}
          />
          <Button
            size="sm"
            disabled={pending || date === ''}
            onClick={() => {
              setOpen(false)
              run(true, () => markPaidAction({ ...key, paidOn: date }))
            }}
          >
            Confirmar
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  )
}

/** Undo a payment (the paid items of "A pagar"). */
export function UnpayButton({ landing }: { landing: Landing }) {
  const { pending, run } = usePaymentWrite(landing)
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      aria-label={`Desfazer: ${occurrenceName(landing)}`}
      onClick={() => run(false, () => unmarkPaidAction(paymentKeyOf(landing)))}
    >
      Desfazer
    </Button>
  )
}
