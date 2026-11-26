'use client'

import { deleteRuleAction } from '@/features/ledger/adapters/actions/categorize'
import { formatMoney } from '@/features/ledger/core/format'
import type { CategorizationRule } from '@/features/ledger/core/similar'
import { Button } from '@cbrl/design'
import { Trash2 } from 'lucide-react'
import { useState, useTransition } from 'react'

const rangeLabel = (rule: Pick<CategorizationRule, 'minCents' | 'maxCents'>) =>
  rule.minCents === rule.maxCents
    ? formatMoney(rule.minCents)
    : `${formatMoney(rule.minCents)} a ${formatMoney(rule.maxCents)}`

/**
 * Configurações → Regras: what "Fazer isso sozinho daqui para frente"
 * recorded. Each rule shows the description it matches, the amount range
 * and what it sets; deleting stops it for new bank entries (what it already
 * classified stays).
 */
export function RulesSettings({
  rules,
  onChanged,
}: {
  rules: readonly CategorizationRule[]
  onChanged: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (rules.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nenhuma regra ainda. Ao mudar a categoria de uma transação do banco, marque “Fazer isso
        sozinho daqui para frente”.
      </p>
    )
  }

  const remove = (id: string) =>
    startTransition(async () => {
      const result = await deleteRuleAction({ id })
      if (!result.ok) return setError(result.error)
      setError(null)
      onChanged()
    })

  return (
    <div className="grid gap-3">
      <ul className="divide-y rounded-md border" aria-label="Regras">
        {rules.map((rule) => (
          <li key={rule.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <div className="grid min-w-0 flex-1 gap-0.5">
              <p className="truncate font-medium">“{rule.pattern}”</p>
              <p className="text-muted-foreground truncate text-xs">
                {rangeLabel(rule)} →{' '}
                {[rule.categoryName, rule.potName].filter(Boolean).join(' · ') || '—'}
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              disabled={pending}
              onClick={() => remove(rule.id)}
              aria-label={`Excluir regra ${rule.pattern}`}
            >
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
      {error !== null && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </div>
  )
}
