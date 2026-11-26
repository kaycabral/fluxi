'use client'

import { ButtonGroup } from '@/components/button-group'
import { markPaidAction, unmarkPaidAction } from '@/features/ledger/adapters/actions/payments'
import type { ActionResult } from '@/features/ledger/core/action-result'
import { paidLabel } from '@/features/ledger/core/labels'
import type { Landing } from '@/features/ledger/core/occurrence'
import { dayMonth, payControlLabel, payShortcuts } from '@/features/ledger/core/pay-dates'
import { landingDate, paymentKeyOf } from '@/features/ledger/core/payments'
import {
  Button,
  Calendar,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@cbrl/design'
import { CalendarDays, Check, ChevronDown, Landmark, Undo2 } from 'lucide-react'
import { useOptimistic, useRef, useState, useTransition } from 'react'
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

/** ISO day ↔ local `Date`: the calendar works in local days. */
function isoToLocalDate(iso: string): Date {
  return new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
}

function localDateToIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * The short visible label: hidden until the nearest `@container` ancestor is
 * wide enough, so narrow widgets get icon-only buttons with the same names.
 */
function ShortLabel({ children }: { children: string }) {
  return <span className="hidden @sm:inline">{children}</span>
}

/**
 * "Pagar"/"Receber" (today) joined to a menu of past dates (ontem,
 * anteontem, no vencimento, outra data… in a calendar). Same width per
 * state, so the rows of a list line up.
 */
export function PayButton({ landing }: { landing: Landing }) {
  if (landing.entry.fromBank) return <BankPaidBadge landing={landing} />
  return <EditablePayButton landing={landing} />
}

function EditablePayButton({ landing }: { landing: Landing }) {
  const { refs } = useLedgerUi()
  const { pending, run } = usePaymentWrite(landing)
  const [pickerOpen, setPickerOpen] = useState(false)
  // Set by "Outra data…": the picker opens only once the menu has closed and
  // returned focus, else that focus move dismisses the brand-new popover.
  const pickAfterClose = useRef(false)
  const today = refs.today
  const label = paidLabel(landing.amountCents)
  const action = `Marcar como ${label.toLowerCase()}`
  const name = occurrenceName(landing)
  const key = paymentKeyOf(landing)
  const shortcuts = payShortcuts(today, landingDate(landing))
  const payOn = (paidOn?: string) =>
    run(true, () => markPaidAction(paidOn === undefined ? key : { ...key, paidOn }))

  return (
    <ButtonGroup aria-label={`${action}: ${name}`} className="ml-auto">
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="w-8 px-0 @sm:w-24 @sm:px-3"
              disabled={pending}
              aria-label={`${action}: ${name}`}
              onClick={() => payOn()}
            >
              <Check />
              <ShortLabel>{payControlLabel(landing.amountCents, false)}</ShortLabel>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{action} hoje</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {/* The popover anchors on the menu trigger; only "Outra data…" opens it. */}
      <Popover open={pickerOpen} onOpenChange={(next) => !next && setPickerOpen(false)}>
        <DropdownMenu>
          <PopoverTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="w-7 pl-2!"
                disabled={pending}
                aria-label={`Mais opções: ${name}`}
              >
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
          </PopoverTrigger>
          <DropdownMenuContent
            align="end"
            className="w-max"
            onCloseAutoFocus={(e) => {
              if (!pickAfterClose.current) return
              pickAfterClose.current = false
              e.preventDefault()
              setPickerOpen(true)
            }}
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
              {label} em
            </DropdownMenuLabel>
            {shortcuts.map((s) => (
              <DropdownMenuItem key={s.key} onSelect={() => payOn(s.date)}>
                {s.label}
                <span className="text-muted-foreground ml-auto pl-4 text-xs tabular-nums">
                  {dayMonth(s.date)}
                </span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                pickAfterClose.current = true
              }}
            >
              <CalendarDays /> Outra data…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <PopoverContent align="end" className="w-auto p-0" aria-label={`${label} em`}>
          <Calendar
            defaultMonth={isoToLocalDate(today)}
            endMonth={isoToLocalDate(today)}
            disabled={{ after: isoToLocalDate(today) }}
            onDayClick={(date) => {
              setPickerOpen(false)
              payOn(localDateToIso(date))
            }}
          />
        </PopoverContent>
      </Popover>
    </ButtonGroup>
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
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground w-15 px-0 @sm:w-31 @sm:px-3"
            disabled={pending}
            aria-label={`Desfazer: ${occurrenceName(landing)}`}
            onClick={() => run(false, () => unmarkPaidAction(paymentKeyOf(landing)))}
          >
            <Undo2 />
            <ShortLabel>{payControlLabel(landing.amountCents, true)}</ShortLabel>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Desfazer</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
