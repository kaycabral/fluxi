'use client'

import { createEntryAction } from '@/features/ledger/adapters/actions/entries'
import { defaultPotOf, newEntryValues, valuesToFields } from '@/features/ledger/core/entry-form'
import { dayLongLabel } from '@/features/ledger/core/format'
import type { EntryKind } from '@/features/ledger/core/types'
import { Button } from '@cbrl/design'
import { Banknote, Clock, Loader2, Repeat, Wallet, X } from 'lucide-react'
import { useState, useTransition } from 'react'
import { KindToggle, TitleInput } from './entry-fields'
import { defaultAccountOf, useLedgerUi } from './ledger-shell'
import { MoneyInput } from './money-input'
import { RepeatField, type RepeatValue } from './repeat-field'
import { AccountSelect } from './selects'

const QUICK_KINDS: readonly EntryKind[] = ['income', 'expense']

/**
 * Quick add on a calendar day, laid out like Google Calendar's: a big
 * description, Entrada/Saída, the date and its repetition, then amount and
 * account, each row led by its icon. "Mais opções" carries what was typed to
 * the full sheet (installments, category, pot, tags, parts, transfer).
 */
export function QuickAddForm({ date, onDone }: { date: string; onDone: () => void }) {
  const { refs, openNew, offerUndo } = useLedgerUi()
  const [kind, setKind] = useState<EntryKind>('expense')
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
    const converted = valuesToFields({
      ...newEntryValues({ date, accountId, kind, defaultPot: defaultPotOf(refs.pots) }),
      ...typed,
    })
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
      offerUndo(result, 'Lançamento salvo.')
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
      <TitleInput
        id="quick-description"
        aria-label="Descrição"
        size="md"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <span aria-hidden />
      <KindToggle kinds={QUICK_KINDS} value={kind} onChange={setKind} />
      <Clock className="text-muted-foreground size-5" aria-hidden />
      <p className="text-sm first-letter:uppercase">{dayLongLabel(date)}</p>
      <Repeat className="text-muted-foreground size-5" aria-hidden />
      <RepeatField date={date} value={repeat} onChange={setRepeat} />
      <Banknote className="text-muted-foreground size-5" aria-hidden />
      <MoneyInput id="quick-amount" aria-label="Valor" value={amount} onValueChange={setAmount} />
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
