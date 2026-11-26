'use client'

import { markPaidAction, unmarkPaidAction } from '@/features/ledger/adapters/actions/payments'
import type { ActionResult } from '@/features/ledger/core/action-result'
import { paidLabel } from '@/features/ledger/core/labels'
import type { Landing } from '@/features/ledger/core/occurrence'
import { paymentKeyOf } from '@/features/ledger/core/payments'
import {
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@cbrl/design'
import { CalendarDays, Check, ChevronDown, Landmark } from 'lucide-react'
import { useId, useOptimistic, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { useLedgerUi } from './ledger-shell'

/** "Aluguel" or "Salário (Adiantamento)": names the occurrence in accessible labels. */
export function occurrenceName(landing: Landing): string {
  const { entry, part } = landing
  return part === null ? entry.description : `${entry.description} (${part.label})`
}

/** "Marcado como pago." / "Desmarcado como recebido.": the toast of a payment write. */
export function paidMessage(amountCents: number, marked: boolean): string {
  return `${marked ? 'Marcado' : 'Desmarcado'} como ${paidLabel(amountCents).toLowerCase()}.`
}

/** Mark (`marked`) or unmark one occurrence: errors become toasts, a success offers "Desfazer". */
function usePaymentWrite(landing: Landing) {
  const { offerUndo } = useLedgerUi()
  const [pending, startTransition] = useTransition()
  const run = (marked: boolean, write: () => Promise<ActionResult>) => {
    startTransition(async () => {
      const result = await write()
      if (!result.ok) toast.error(result.error)
      else offerUndo(result, paidMessage(landing.amountCents, marked))
    })
  }
  return { pending, run }
}

/** "Pago"/"Recebido" of a bank entry: the bank says it happened; nothing to toggle. */
export function BankPaidBadge({ landing }: { landing: Landing }) {
  return (
    <span
      className="text-muted-foreground inline-flex items-center gap-1 text-xs"
      title="Vem do banco"
    >
      <Landmark className="size-3.5" aria-hidden />
      {paidLabel(landing.amountCents)} · banco
    </span>
  )
}

/** Paid checkbox of one occurrence (dia a dia). Optimistic; clicks never reach the row. */
export function PaidCheckbox({ landing, paid }: { landing: Landing; paid: boolean }) {
  if (landing.entry.fromBank) return <BankPaidBadge landing={landing} />
  return <EditablePaidCheckbox landing={landing} paid={paid} />
}

function EditablePaidCheckbox({ landing, paid }: { landing: Landing; paid: boolean }) {
  const { offerUndo } = useLedgerUi()
  const [, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useOptimistic(paid)
  const label = paidLabel(landing.amountCents)
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
          else offerUndo(result, paidMessage(landing.amountCents, next))
        })
      }}
    />
  )
}

/**
 * "Marcar como pago/recebido" (today) as an icon button attached to a menu
 * with the same action on another date (a date popover). Fixed width, so
 * the rows of a list line up.
 */
export function PayButton({ landing }: { landing: Landing }) {
  if (landing.entry.fromBank) return <BankPaidBadge landing={landing} />
  return <EditablePayButton landing={landing} />
}

function EditablePayButton({ landing }: { landing: Landing }) {
  const { refs } = useLedgerUi()
  const { pending, run } = usePaymentWrite(landing)
  const [date, setDate] = useState(refs.today)
  const [open, setOpen] = useState(false)
  const id = useId()
  const label = paidLabel(landing.amountCents)
  const action = `Marcar como ${label.toLowerCase()}`
  const name = occurrenceName(landing)
  const key = paymentKeyOf(landing)

  return (
    <div role="group" aria-label={`${action}: ${name}`} className="flex w-16 justify-end">
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon-sm"
              variant="outline"
              className="rounded-r-none"
              disabled={pending}
              aria-label={`${action}: ${name}`}
              onClick={() => run(true, () => markPaidAction(key))}
            >
              <Check />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{action}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {/* The popover anchors on the menu trigger; only the menu item opens it. */}
      <Popover open={open} onOpenChange={(next) => !next && setOpen(false)}>
        <DropdownMenu>
          <PopoverTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-sm"
                variant="outline"
                className="w-7 rounded-l-none border-l-0"
                disabled={pending}
                aria-label={`Mais opções: ${name}`}
              >
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
          </PopoverTrigger>
          <DropdownMenuContent align="end" onCloseAutoFocus={(e) => open && e.preventDefault()}>
            <DropdownMenuItem onSelect={() => setOpen(true)}>
              <CalendarDays /> {label} em outra data…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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

/** Undo a payment (the paid items of "A pagar"); a bank entry stays paid. */
export function UnpayButton({ landing }: { landing: Landing }) {
  if (landing.entry.fromBank) return <BankPaidBadge landing={landing} />
  return <EditableUnpayButton landing={landing} />
}

function EditableUnpayButton({ landing }: { landing: Landing }) {
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
