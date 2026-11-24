'use client'

import { createEntryAction } from '@/features/ledger/adapters/actions/entries'
import { newEntryValues, valuesToFields } from '@/features/ledger/core/entry-form'
import { dayLongLabel } from '@/features/ledger/core/format'
import { Button, cn, Input, Label } from '@cbrl/design'
import { Loader2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { defaultAccountOf, useLedgerUi } from './ledger-shell'
import { AccountSelect } from './selects'

type QuickKind = 'expense' | 'income'

const QUICK_KINDS: { kind: QuickKind; label: string }[] = [
  { kind: 'expense', label: 'Saída' },
  { kind: 'income', label: 'Entrada' },
]

/**
 * Quick add on a calendar day (like creating an event in Google Calendar):
 * kind, amount, description and account, saved as a one-off entry on `date`.
 * "Mais opções" carries what was typed to the full sheet (repetition, category,
 * pot, parts, transfer).
 */
export function QuickAddForm({ date, onDone }: { date: string; onDone: () => void }) {
  const { refs, openNew } = useLedgerUi()
  const [kind, setKind] = useState<QuickKind>('expense')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [accountId, setAccountId] = useState(() => defaultAccountOf(refs))
  const [entryId] = useState(() => crypto.randomUUID())
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const accounts = refs.accounts.filter((a) => !a.archived)

  const typed = { kind, amount, description, accountId }

  function save() {
    const converted = valuesToFields({ ...newEntryValues({ date, accountId, kind }), ...typed })
    if (!converted.ok) {
      setError(converted.error)
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await createEntryAction({ id: entryId, fields: converted.fields })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success('Lançamento salvo.')
      onDone()
    })
  }

  function moreOptions() {
    onDone()
    openNew({ date, values: typed })
  }

  return (
    <form
      aria-label="Criar lançamento"
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <p className="text-muted-foreground text-sm first-letter:uppercase">{dayLongLabel(date)}</p>
      <div
        role="group"
        aria-label="Tipo"
        className="bg-muted grid grid-cols-2 gap-1 rounded-lg p-1"
      >
        {QUICK_KINDS.map((option) => (
          <Button
            key={option.kind}
            type="button"
            size="sm"
            variant={kind === option.kind ? 'outline' : 'ghost'}
            aria-pressed={kind === option.kind}
            className={cn(kind === option.kind && 'bg-background font-semibold shadow-sm')}
            onClick={() => setKind(option.kind)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="quick-amount">Valor (R$)</Label>
        <Input
          id="quick-amount"
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="quick-description">Descrição</Label>
        <Input
          id="quick-description"
          list="quick-descriptions"
          autoComplete="off"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <datalist id="quick-descriptions">
          {refs.descriptions.map((d) => (
            <option key={d} value={d} />
          ))}
        </datalist>
      </div>
      <AccountSelect
        aria-label="Conta"
        banks={refs.banks}
        accounts={accounts}
        value={accountId}
        onValueChange={setAccountId}
      />
      {error !== null && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={moreOptions}>
          Mais opções
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Salvar
        </Button>
      </div>
    </form>
  )
}
