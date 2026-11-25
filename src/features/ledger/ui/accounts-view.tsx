'use client'

import { saveAccountAction, saveBankAction } from '@/features/ledger/adapters/actions/accounts'
import { INITIAL_FORM_STATE, type FormState } from '@/features/ledger/core/action-result'
import { monthLabel, signedCentsToInput } from '@/features/ledger/core/format'
import { ACCOUNT_TYPE_LABELS } from '@/features/ledger/core/labels'
import type { Month } from '@/features/ledger/core/month'
import type { Account, Bank } from '@/features/ledger/core/types'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  cn,
  Input,
  Label,
  Switch,
} from '@cbrl/design'
import { Loader2, Plus } from 'lucide-react'
import { startTransition, useActionState, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Money } from './money'
import { OptionSelect } from './selects'

const TYPE_OPTIONS = Object.entries(ACCOUNT_TYPE_LABELS)

export type AccountsViewProps = {
  banks: Bank[]
  accounts: Account[]
  firstMonth: Month
  laterMonth: Month
  firstClosing: Record<string, number> | null
  laterClosing: Record<string, number> | null
  /** Fresh ids minted by the server render, so a resubmitted create is a no-op. */
  newBankId: string
  newAccountId: string
}

function useFeedback(state: FormState, success?: string) {
  useEffect(() => {
    if (state.error !== null) toast.error(state.error)
    else if (state.savedAt > 0 && success !== undefined) toast.success(success)
  }, [state, success])
}

/**
 * Submits the form when a field changed (blur for text, change for selects and
 * switches). The submit runs in an effect, after React committed the new
 * values to the form's inputs, and several requests in one render coalesce.
 */
function useAutoSubmit() {
  const ref = useRef<HTMLFormElement>(null)
  const [requests, setRequests] = useState(0)
  useEffect(() => {
    if (requests > 0) ref.current?.requestSubmit()
  }, [requests])
  return { ref, submit: () => setRequests((n) => n + 1) }
}

/**
 * Submit handler that dispatches the form action without React's automatic
 * form reset (which would make the Radix switch/select revert to their initial
 * values and submit again). Before hydration the form posts natively.
 */
function submitWithoutReset(action: (formData: FormData) => void) {
  return (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    startTransition(() => action(formData))
  }
}

function BankNameForm({ bank }: { bank: Bank }) {
  const [state, action, pending] = useActionState(saveBankAction, INITIAL_FORM_STATE)
  const form = useAutoSubmit()
  useFeedback(state)
  return (
    <form
      ref={form.ref}
      action={action}
      onSubmit={submitWithoutReset(action)}
      className="flex items-center gap-2"
    >
      <input type="hidden" name="id" value={bank.id} />
      <Input
        name="name"
        aria-label="Nome do banco"
        defaultValue={bank.name}
        className="h-9 max-w-56 font-semibold"
        onBlur={(e) => {
          if (e.target.value !== bank.name) form.submit()
        }}
      />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pending}
        className="sr-only focus:not-sr-only"
      >
        Salvar
      </Button>
      {pending && (
        <Loader2 className="text-muted-foreground size-4 animate-spin" aria-label="Salvando" />
      )}
    </form>
  )
}

function AccountRow({
  account,
  firstCents,
  laterCents,
  labels,
}: {
  account: Account
  firstCents: number | null
  laterCents: number | null
  labels: { first: string; later: string }
}) {
  const [state, action, pending] = useActionState(saveAccountAction, INITIAL_FORM_STATE)
  const form = useAutoSubmit()
  useFeedback(state)
  const submitIfChanged = (value: string, initial: string) => {
    if (value !== initial) form.submit()
  }
  const opening = signedCentsToInput(account.openingBalanceCents)
  const [type, setType] = useState<string>(account.type)
  const [active, setActive] = useState(!account.archived)
  return (
    <form
      ref={form.ref}
      action={action}
      onSubmit={submitWithoutReset(action)}
      className={cn(
        'border-border grid grid-cols-2 items-end gap-3 border-t py-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto_auto_auto] [&>*]:min-w-0',
        account.archived && 'opacity-60',
      )}
    >
      <input type="hidden" name="id" value={account.id} />
      <div className="col-span-2 grid gap-1 sm:col-span-1">
        <Label htmlFor={`acc-name-${account.id}`} className="text-muted-foreground text-xs">
          Conta
        </Label>
        <Input
          id={`acc-name-${account.id}`}
          name="name"
          defaultValue={account.name}
          onBlur={(e) => submitIfChanged(e.target.value, account.name)}
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor={`acc-type-${account.id}`} className="text-muted-foreground text-xs">
          Tipo
        </Label>
        <input type="hidden" name="type" value={type} />
        <OptionSelect
          id={`acc-type-${account.id}`}
          options={TYPE_OPTIONS}
          value={type}
          onValueChange={(next) => {
            setType(next)
            form.submit()
          }}
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor={`acc-opening-${account.id}`} className="text-muted-foreground text-xs">
          Saldo inicial
        </Label>
        <Input
          id={`acc-opening-${account.id}`}
          name="openingBalance"
          inputMode="decimal"
          className="text-right font-mono"
          defaultValue={opening}
          onBlur={(e) => submitIfChanged(e.target.value, opening)}
        />
      </div>
      <div className="grid gap-1 text-right">
        <span className="text-muted-foreground text-xs">Fim de {labels.first}</span>
        <span className="py-2">
          {firstCents === null ? '–' : <Money cents={firstCents} tone />}
        </span>
      </div>
      <div className="grid gap-1 text-right">
        <span className="text-muted-foreground text-xs">Fim de {labels.later}</span>
        <span className="py-2">
          {laterCents === null ? '–' : <Money cents={laterCents} tone />}
        </span>
      </div>
      <div className="flex items-center gap-2 py-2">
        {active && <input type="hidden" name="active" value="on" />}
        <Switch
          id={`acc-active-${account.id}`}
          checked={active}
          onCheckedChange={(checked) => {
            setActive(checked)
            form.submit()
          }}
        />
        <Label htmlFor={`acc-active-${account.id}`} className="text-sm font-normal">
          Ativa
        </Label>
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          disabled={pending}
          className="sr-only focus:not-sr-only"
        >
          Salvar
        </Button>
        {pending && (
          <Loader2 className="text-muted-foreground size-4 animate-spin" aria-label="Salvando" />
        )}
      </div>
    </form>
  )
}

function NewBankForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(saveBankAction, INITIAL_FORM_STATE)
  useFeedback(state, 'Banco criado.')
  return (
    <form key={state.savedAt} action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="intent" value="create" />
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-1">
        <Label htmlFor="new-bank-name">Novo banco</Label>
        <Input id="new-bank-name" name="name" placeholder="Ex.: Nubank" className="w-48" required />
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        <Plus /> Banco
      </Button>
    </form>
  )
}

function NewAccountForm({ id, banks }: { id: string; banks: Bank[] }) {
  const [state, action, pending] = useActionState(saveAccountAction, INITIAL_FORM_STATE)
  useFeedback(state, 'Conta criada.')
  const [bankId, setBankId] = useState(banks.at(-1)?.id ?? '')
  const [type, setType] = useState('checking')
  if (banks.length === 0) return null
  return (
    <form key={state.savedAt} action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="intent" value="create" />
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-1">
        <Label htmlFor="new-account-bank">Banco</Label>
        <input type="hidden" name="bankId" value={bankId} />
        <OptionSelect
          id="new-account-bank"
          className="w-40"
          options={banks.map((b) => [b.id, b.name] as const)}
          value={bankId}
          onValueChange={setBankId}
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="new-account-name">Nova conta</Label>
        <Input
          id="new-account-name"
          name="name"
          placeholder="Ex.: Conta corrente"
          className="w-44"
          required
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="new-account-type">Tipo</Label>
        <input type="hidden" name="type" value={type} />
        <OptionSelect
          id="new-account-type"
          className="w-40"
          options={TYPE_OPTIONS}
          value={type}
          onValueChange={setType}
        />
      </div>
      <div className="grid gap-1">
        <Label htmlFor="new-account-opening">Saldo inicial</Label>
        <Input
          id="new-account-opening"
          name="openingBalance"
          inputMode="decimal"
          placeholder="0"
          className="w-28"
        />
      </div>
      <Button type="submit" variant="outline" disabled={pending}>
        <Plus /> Conta
      </Button>
    </form>
  )
}

/** "Bancos e contas": banks with nested accounts, edited in place. */
export function AccountsView(props: AccountsViewProps) {
  const { banks, accounts, firstClosing, laterClosing } = props
  const labels = { first: monthLabel(props.firstMonth), later: monthLabel(props.laterMonth) }
  const sum = (balances: Record<string, number> | null, ids: string[]) =>
    balances === null ? null : ids.reduce((total, id) => total + (balances[id] ?? 0), 0)
  const active = accounts.filter((a) => !a.archived)
  const totals = [{ label: 'Saldo total', ids: active.map((a) => a.id) }]

  return (
    <div className="grid gap-4">
      {active.length > 0 && (
        <Card>
          <CardContent className="grid gap-2">
            <table className="w-full max-w-md text-sm">
              <thead>
                <tr className="text-muted-foreground text-xs">
                  <th className="py-1 text-left font-normal">
                    <span className="sr-only">Total</span>
                  </th>
                  <th className="py-1 text-right font-normal">Fim de {labels.first}</th>
                  <th className="py-1 text-right font-normal">Fim de {labels.later}</th>
                </tr>
              </thead>
              <tbody>
                {totals.map(({ label, ids }) => {
                  const first = sum(firstClosing, ids)
                  const later = sum(laterClosing, ids)
                  return (
                    <tr key={label}>
                      <th scope="row" className="py-1 text-left font-medium">
                        {label}
                      </th>
                      <td className="py-1 text-right">
                        {first === null ? '–' : <Money cents={first} tone />}
                      </td>
                      <td className="py-1 text-right">
                        {later === null ? '–' : <Money cents={later} tone />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
      {banks.map((bank) => {
        const own = accounts.filter((a) => a.bankId === bank.id)
        const ids = own.map((a) => a.id)
        const first = sum(firstClosing, ids)
        const later = sum(laterClosing, ids)
        return (
          <Card key={bank.id}>
            <CardHeader className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle asChild>
                <h2 className="sr-only">{bank.name}</h2>
              </CardTitle>
              <BankNameForm bank={bank} />
              <div className="text-muted-foreground flex gap-4 text-xs">
                <span>
                  Fim de {labels.first}: {first === null ? '–' : <Money cents={first} tone />}
                </span>
                <span>
                  Fim de {labels.later}: {later === null ? '–' : <Money cents={later} tone />}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {own.length === 0 && (
                <p className="text-muted-foreground text-sm">Nenhuma conta neste banco ainda.</p>
              )}
              {own.map((account) => (
                <AccountRow
                  key={`${account.id}-${account.name}-${account.type}-${account.openingBalanceCents}-${account.archived}`}
                  account={account}
                  labels={labels}
                  firstCents={firstClosing?.[account.id] ?? null}
                  laterCents={laterClosing?.[account.id] ?? null}
                />
              ))}
            </CardContent>
          </Card>
        )
      })}

      <Card>
        <CardContent className="grid gap-4">
          <NewBankForm id={props.newBankId} />
          <NewAccountForm id={props.newAccountId} banks={banks} />
          <p className="text-muted-foreground text-xs">
            Saldo inicial é o que havia em cada conta no dia 1º de {labels.first}, mês em que a
            contagem começa. Preencha uma vez; zero se preferir começar do zero. Cartão de crédito
            começa em zero e fica negativo com as compras.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
