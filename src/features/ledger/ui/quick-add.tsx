'use client'

import { createEntryAction } from '@/features/ledger/adapters/actions/entries'
import { newEntryValues, valuesToFields } from '@/features/ledger/core/entry-form'
import { dayLongLabel } from '@/features/ledger/core/format'
import { Button, cn, Input } from '@cbrl/design'
import { Banknote, Clock, Loader2, Wallet, X } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { defaultAccountOf, useLedgerUi } from './ledger-shell'
import { RepeatField, type RepeatValue } from './repeat-field'
import { AccountSelect } from './selects'

type QuickKind = 'expense' | 'income'

const QUICK_KINDS: { kind: QuickKind; label: string }[] = [
  { kind: 'expense', label: 'Saída' },
  { kind: 'income', label: 'Entrada' },
]

/**
 * Quick add on a calendar day, laid out like Google Calendar's: a big
 * description, Saída/Entrada pills, the date with its repetition, then amount
 * and account. "Mais opções" carries what was typed to the full sheet
 * (installments, category, pot, parts, transfer).
 */
export function QuickAddForm({ date, onDone }: { date: string; onDone: () => void }) {
  const { refs, openNew } = useLedgerUi()
  const [kind, setKind] = useState<QuickKind>('expense')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [repeat, setRepeat] = useState<RepeatValue>({
    recurrence: 'none',
    repeatEvery: 1,
    monthBy: 'day',
    endMonth: '',
    installments: '',
  })
  const [accountId, setAccountId] = useState(() => defaultAccountOf(refs))
  const [entryId] = useState(() => crypto.randomUUID())
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const accounts = refs.accounts.filter((a) => !a.archived)

  const typed = { kind, amount, description, accountId, ...repeat }

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
      className="grid grid-cols-[1.25rem_1fr] items-center gap-x-4 gap-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <div className="col-span-2 -mt-1 -mr-1 flex justify-end">
        <Button type="button" variant="ghost" size="icon-sm" aria-label="Fechar" onClick={onDone}>
          <X />
        </Button>
      </div>
      <span aria-hidden />
      <Input
        id="quick-description"
        aria-label="Descrição"
        list="quick-descriptions"
        autoComplete="off"
        placeholder="Adicionar descrição"
        className="focus-visible:border-b-primary h-11 rounded-none border-0 border-b-2 px-0 text-xl shadow-none focus-visible:ring-0 [&::-webkit-calendar-picker-indicator]:hidden"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <datalist id="quick-descriptions">
        {refs.descriptions.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
      <span aria-hidden />
      <div role="group" aria-label="Tipo" className="flex gap-2">
        {QUICK_KINDS.map((option) => (
          <Button
            key={option.kind}
            type="button"
            size="sm"
            variant={kind === option.kind ? 'secondary' : 'ghost'}
            aria-pressed={kind === option.kind}
            className={cn('rounded-md', kind === option.kind && 'font-semibold')}
            onClick={() => setKind(option.kind)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <Clock className="text-muted-foreground size-5" aria-hidden />
      <div className="grid gap-0.5">
        <p className="text-sm first-letter:uppercase">{dayLongLabel(date)}</p>
        <RepeatField
          date={date}
          className="text-muted-foreground h-auto border-0 p-0 text-xs shadow-none"
          value={repeat}
          onChange={setRepeat}
        />
      </div>
      <Banknote className="text-muted-foreground size-5" aria-hidden />
      <Input
        id="quick-amount"
        aria-label="Valor (R$)"
        inputMode="decimal"
        autoComplete="off"
        placeholder="Valor (R$)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <Wallet className="text-muted-foreground size-5" aria-hidden />
      <AccountSelect
        aria-label="Conta"
        banks={refs.banks}
        accounts={accounts}
        value={accountId}
        onValueChange={setAccountId}
      />
      {error !== null && (
        <p role="alert" className="text-destructive col-span-2 text-sm">
          {error}
        </p>
      )}
      <div className="col-span-2 flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={moreOptions}>
          Mais opções
        </Button>
        <Button type="submit" className="rounded-full px-6" disabled={pending}>
          {pending && <Loader2 className="animate-spin" />}
          Salvar
        </Button>
      </div>
    </form>
  )
}
