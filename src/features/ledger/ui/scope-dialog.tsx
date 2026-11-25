'use client'

import type { EditScope } from '@/features/ledger/core/scoped-edit'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  RadioGroup,
  RadioGroupItem,
} from '@cbrl/design'
import { useState } from 'react'

export type ScopeRequest = {
  /** `edit`: amount/day change; `delete`: removing an occurrence of a series. */
  kind: 'edit' | 'delete'
  /** E.g. "Luz em dez/26: valor R$ 260 → R$ 300". */
  description: string
  /** Hide "Só este mês" (a new split applies to the repetition, not to one month). */
  seriesOnly?: boolean
}

const OPTIONS: Record<ScopeRequest['kind'], { value: EditScope; title: string; hint: string }[]> = {
  edit: [
    { value: 'one', title: 'Só este mês', hint: 'Exceção pontual. Os outros meses não mudam.' },
    {
      value: 'future',
      title: 'Este e os próximos',
      hint: 'Encerra a repetição atual no mês anterior e cria uma nova a partir deste mês.',
    },
    { value: 'all', title: 'Todos', hint: 'Muda em todos os meses.' },
  ],
  delete: [
    { value: 'one', title: 'Só este mês', hint: 'Pula só esta ocorrência.' },
    {
      value: 'future',
      title: 'Este e os próximos',
      hint: 'Encerra a repetição no mês anterior.',
    },
    { value: 'all', title: 'Todos', hint: 'Apaga o lançamento em todos os meses.' },
  ],
}

function isScope(value: string): value is EditScope {
  return value === 'one' || value === 'future' || value === 'all'
}

/** "Aplicar a mudança em…": where an occurrence edit/delete applies. */
export function ScopeDialog({
  request,
  onResolve,
}: {
  request: ScopeRequest | null
  onResolve: (scope: EditScope | null) => void
}) {
  const [scope, setScope] = useState<EditScope>('future')
  const kind = request?.kind ?? 'edit'
  const seriesOnly = request?.seriesOnly === true
  const effective: EditScope = seriesOnly && scope === 'one' ? 'future' : scope

  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) onResolve(null)
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{kind === 'edit' ? 'Aplicar a mudança em…' : 'Excluir em…'}</DialogTitle>
          <DialogDescription>{request?.description}</DialogDescription>
        </DialogHeader>
        <RadioGroup
          value={effective}
          onValueChange={(value) => {
            if (isScope(value)) setScope(value)
          }}
          className="gap-2"
        >
          {OPTIONS[kind]
            .filter((option) => !(seriesOnly && option.value === 'one'))
            .map((option) => (
              <Label
                key={option.value}
                htmlFor={`scope-${option.value}`}
                className="border-border hover:bg-muted/50 flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal"
              >
                <RadioGroupItem
                  id={`scope-${option.value}`}
                  value={option.value}
                  className="mt-0.5"
                />
                <span className="grid gap-0.5">
                  <span className="text-sm font-medium">{option.title}</span>
                  <span className="text-muted-foreground text-xs">{option.hint}</span>
                </span>
              </Label>
            ))}
        </RadioGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => onResolve(null)}>
            Cancelar
          </Button>
          <Button
            variant={kind === 'delete' ? 'destructive' : 'default'}
            onClick={() => onResolve(effective)}
          >
            {kind === 'delete' ? 'Excluir' : 'Aplicar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
