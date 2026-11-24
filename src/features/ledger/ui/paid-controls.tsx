'use client'

import { markPaidAction, unmarkPaidAction } from '@/features/ledger/adapters/actions/payments'
import { paidLabel } from '@/features/ledger/core/labels'
import type { Landing } from '@/features/ledger/core/occurrence'
import { paymentKeyOf } from '@/features/ledger/core/payments'
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

/** Mark/unmark one occurrence; errors become toasts. */
function usePaymentWrite() {
  const [pending, startTransition] = useTransition()
  const run = (write: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    startTransition(async () => {
      const result = await write()
      if (!result.ok) toast.error(result.error)
    })
  }
  return { pending, run }
}

/** Paid checkbox of one occurrence (dia a dia). Optimistic; clicks never reach the row. */
export function PaidCheckbox({ landing, paid }: { landing: Landing; paid: boolean }) {
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
        })
      }}
    />
  )
}

/** One-click "Pago"/"Recebido" (today) plus a popover to pick another date. */
export function PayButton({ landing }: { landing: Landing }) {
  const { refs } = useLedgerUi()
  const { pending, run } = usePaymentWrite()
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
        onClick={() => run(() => markPaidAction(key))}
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
              run(() => markPaidAction({ ...key, paidOn: date }))
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
  const { pending, run } = usePaymentWrite()
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      aria-label={`Desfazer: ${occurrenceName(landing)}`}
      onClick={() => run(() => unmarkPaidAction(paymentKeyOf(landing)))}
    >
      Desfazer
    </Button>
  )
}
