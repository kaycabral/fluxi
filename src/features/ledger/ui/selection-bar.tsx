'use client'

import { categorizeEntriesAction } from '@/features/ledger/adapters/actions/categorize'
import type { Category, Pot } from '@/features/ledger/core/types'
import { Button } from '@cbrl/design'
import { Loader2, X } from 'lucide-react'
import { useState, useTransition } from 'react'
import { CategorySelect, PotSelect } from './selects'

/** Selection mode ("Selecionar"): rows toggle instead of opening; ids of the entries. */
export function useEntrySelection() {
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const toggleSelected = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const clearSelected = () => setSelected(new Set())
  const stopSelecting = () => {
    setSelecting(false)
    clearSelected()
  }
  return { selecting, selected, toggleSelected, setSelecting, stopSelecting, clearSelected }
}

/**
 * The bar under "Lançamentos" while entries are selected: set the category or
 * the pot of all of them at once (only the user's fields: bank entries keep
 * amount, date and account; transfers get neither, incomes no pot).
 */
export function SelectionBar({
  entryIds,
  categories,
  pots,
  onClear,
}: {
  entryIds: readonly string[]
  categories: readonly Category[]
  pots: readonly Pot[]
  onClear: () => void
}) {
  const [status, setStatus] = useState<{ error: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const count = entryIds.length

  const apply = (patch: { categoryId: string } | { pot: string }, what: string) =>
    startTransition(async () => {
      const result = await categorizeEntriesAction({ entryIds, ...patch })
      setStatus(
        result.ok
          ? { error: false, text: `${what} aplicado a ${count}.` }
          : { error: true, text: result.error },
      )
    })

  if (count === 0) return null

  return (
    <div
      role="toolbar"
      aria-label="Ações da seleção"
      className="bg-background fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-2xl flex-wrap items-center gap-2 rounded-2xl border p-2 shadow-lg"
    >
      <span className="px-2 text-sm font-medium" aria-live="polite">
        {count} {count === 1 ? 'selecionado' : 'selecionados'}
      </span>
      <CategorySelect
        aria-label="Categoria da seleção"
        className="w-40"
        placeholder="Categoria"
        categories={categories.filter((c) => !c.archived)}
        value=""
        disabled={pending}
        onValueChange={(categoryId) => {
          if (categoryId !== '') apply({ categoryId }, 'Categoria')
        }}
      />
      <PotSelect
        aria-label="Pote da seleção"
        className="w-36"
        placeholder="Pote"
        pots={pots}
        value=""
        disabled={pending}
        onValueChange={(pot) => {
          if (pot !== '') apply({ pot }, 'Pote')
        }}
      />
      {pending && <Loader2 className="text-muted-foreground size-4 animate-spin" />}
      {status !== null && !pending && (
        <span
          role={status.error ? 'alert' : 'status'}
          className={status.error ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}
        >
          {status.text}
        </span>
      )}
      <Button variant="ghost" size="sm" className="ml-auto" onClick={onClear}>
        <X /> Limpar seleção
      </Button>
    </div>
  )
}
