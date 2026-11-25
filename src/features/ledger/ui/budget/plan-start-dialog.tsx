'use client'

import { saveBudgetPlanAction } from '@/features/ledger/adapters/actions/budget'
import type { Targets } from '@/features/ledger/core/budget'
import { addMonths, monthRange, type Month } from '@/features/ledger/core/month'
import type { BudgetPlan } from '@/features/ledger/core/types'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
} from '@cbrl/design'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { MonthSelect } from '../selects'
import { useAction } from './shared'

/** Dialog that picks the start month of a new version (or moves the current one). */
export function PlanStartDialog({
  open,
  onOpenChange,
  mode,
  plan,
  plans,
  today,
  targets,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'move'
  plan: BudgetPlan
  plans: readonly BudgetPlan[]
  today: Month
  targets: Targets
  onSaved: (startsMonth: Month) => void
}) {
  const taken = new Set(
    plans.filter((p) => p.id !== plan.id || mode === 'create').map((p) => p.startsMonth),
  )
  const options = monthRange(addMonths(today, -36), addMonths(today, 24)).filter(
    (m) => !taken.has(m),
  )
  const fallback = mode === 'create' ? addMonths(today, 1) : plan.startsMonth
  const [month, setMonth] = useState<Month>(
    options.includes(fallback) ? fallback : (options.at(-1) ?? fallback),
  )
  const [pending, run] = useAction()
  const save = () =>
    run(
      () =>
        saveBudgetPlanAction({
          id: mode === 'create' ? null : plan.id,
          startsMonth: month,
          targets,
        }),
      mode === 'create' ? 'Nova versão criada.' : 'Início da versão alterado.',
      () => {
        onOpenChange(false)
        onSaved(month)
      },
    )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create' ? 'Nova versão do orçamento' : 'Mudar início'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? 'Use quando as proporções mudarem (aluguel, aumento, filho…). A nova versão começa com as metas que estão na tela; os meses anteriores continuam medidos pela versão deles.'
              : 'A versão passa a valer a partir do mês escolhido, até a próxima versão começar.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="plan-start">Vale a partir de</Label>
          <MonthSelect id="plan-start" months={options} value={month} onValueChange={setMonth} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {mode === 'create' ? 'Criar versão' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
