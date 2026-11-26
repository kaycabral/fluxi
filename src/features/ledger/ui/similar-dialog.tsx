'use client'

import { categorizeEntriesAction } from '@/features/ledger/adapters/actions/categorize'
import { accountLabel } from '@/features/ledger/core/account-filter'
import { formatMoney } from '@/features/ledger/core/format'
import { isPreselected, type SimilarResult } from '@/features/ledger/core/similar'
import type { LedgerRefs } from '@/features/ledger/core/view'
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  ScrollArea,
} from '@cbrl/design'
import { Loader2 } from 'lucide-react'
import { useState, useTransition } from 'react'

export type SimilarOffer = SimilarResult & {
  /** What the user just saved on the reference entry. */
  categoryId: string | null
  pot: string | null
}

const dayLabel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`

/**
 * "Aplicar a outras N transações parecidas?": after a category/pot change,
 * the bank entries with the same normalized description, each with a
 * checkbox. Preselected only when the amount is close (½× to 2×) and nothing
 * is classified yet; an entry already classified shows what it has and only
 * changes if checked. "Fazer isso sozinho daqui para frente" records a rule
 * over the range of the checked amounts.
 */
export function SimilarDialog({
  offer,
  refs,
  onDone,
}: {
  offer: SimilarOffer
  refs: Pick<LedgerRefs, 'accounts' | 'banks' | 'categories' | 'pots'>
  onDone: (applied: number) => void
}) {
  const [checked, setChecked] = useState(
    () =>
      new Set(
        offer.candidates
          .filter((c) => isPreselected(offer.reference.amountCents, c))
          .map((c) => c.id),
      ),
  )
  const [rule, setRule] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const count = offer.candidates.length

  const toggle = (id: string, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const current = (categoryId: string | null, pot: string | null) =>
    [
      refs.categories.find((c) => c.id === categoryId)?.name,
      refs.pots.find((p) => p.key === pot)?.name,
    ]
      .filter(Boolean)
      .join(' · ')

  function apply() {
    startTransition(async () => {
      const result = await categorizeEntriesAction({
        entryIds: [offer.reference.id, ...checked],
        categoryId: offer.categoryId,
        pot: offer.pot,
        ...(rule ? { ruleFromEntryId: offer.reference.id } : {}),
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      onDone(checked.size)
    })
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onDone(0)
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Aplicar a{' '}
            {count === 1 ? 'outra transação parecida' : `outras ${count} transações parecidas`}?
          </DialogTitle>
          <DialogDescription>
            Mesma descrição de “{offer.reference.description}”. Marcamos as de valor parecido ainda
            sem categoria.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-72">
          <ul className="grid gap-1 pr-3" aria-label="Transações parecidas">
            {offer.candidates.map((c) => {
              const now = current(c.categoryId, c.pot)
              return (
                <li key={c.id}>
                  <Label
                    htmlFor={`similar-${c.id}`}
                    className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 font-normal"
                  >
                    <Checkbox
                      id={`similar-${c.id}`}
                      checked={checked.has(c.id)}
                      onCheckedChange={(on) => toggle(c.id, on === true)}
                    />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate text-sm">
                        {dayLabel(c.date)} · {accountLabel(c.accountId, refs.accounts, refs.banks)}
                      </span>
                      {now !== '' && (
                        <span className="text-muted-foreground truncate text-xs">Hoje: {now}</span>
                      )}
                    </span>
                    <span className="text-sm tabular-nums">{formatMoney(c.amountCents)}</span>
                  </Label>
                </li>
              )
            })}
          </ul>
        </ScrollArea>
        <Label
          htmlFor="similar-rule"
          className="flex cursor-pointer items-center gap-3 rounded-md border p-3 font-normal"
        >
          <Checkbox
            id="similar-rule"
            checked={rule}
            onCheckedChange={(on) => setRule(on === true)}
          />
          <span className="text-sm">Fazer isso sozinho daqui para frente</span>
        </Label>
        {error !== null && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onDone(0)} disabled={pending}>
            Agora não
          </Button>
          <Button onClick={apply} disabled={pending || (checked.size === 0 && !rule)}>
            {pending && <Loader2 className="animate-spin" />}
            {checked.size > 0 ? `Aplicar a ${checked.size}` : 'Só criar a regra'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
