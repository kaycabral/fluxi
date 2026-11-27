'use client'

import {
  createBudgetGroupAction,
  removeBudgetGroupAction,
  updateBudgetGroupAction,
} from '@/features/ledger/adapters/actions/budget'
import { nextBudgetGroupColor } from '@/features/ledger/core/budget'
import {
  GROUP_COLOR_LABELS,
  GROUP_DOT_CLASSES,
  GROUP_GOAL_LABELS,
} from '@/features/ledger/core/labels'
import {
  GROUP_COLORS,
  type BudgetGroup,
  type BudgetGroupColor,
  type BudgetGroupGoal,
} from '@/features/ledger/core/types'
import {
  Button,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@cbrl/design'
import { Check, Loader2, MoreHorizontal, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { focusOnMount, useAction } from './shared'

/** Inline controls of one budget group in "Grupos do orçamento": color, name, menu, and the new-group row. */

export function ColorPicker({ budgetGroup }: { budgetGroup: BudgetGroup }) {
  const [open, setOpen] = useState(false)
  const [, run] = useAction()
  const pick = (color: BudgetGroupColor) => {
    setOpen(false)
    if (color !== budgetGroup.color)
      run(() => updateBudgetGroupAction({ key: budgetGroup.key, color }))
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Cor do grupo ${budgetGroup.name}`}
          className={cn(
            'focus-visible:ring-ring size-3.5 shrink-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
            GROUP_DOT_CLASSES[budgetGroup.color],
          )}
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div className="grid grid-cols-7 gap-1.5" role="radiogroup" aria-label="Cor">
          {GROUP_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={color === budgetGroup.color}
              aria-label={GROUP_COLOR_LABELS[color]}
              title={GROUP_COLOR_LABELS[color]}
              onClick={() => pick(color)}
              className={cn(
                'focus-visible:ring-ring flex size-6 items-center justify-center rounded-md text-white outline-none focus-visible:ring-2',
                GROUP_DOT_CLASSES[color],
              )}
            >
              {color === budgetGroup.color && <Check className="size-3.5" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** Budget group name that turns into an input to rename (Enter saves, Esc cancels). */
export function BudgetGroupName({
  budgetGroup,
  editing,
  onEditingChange,
  htmlFor,
}: {
  budgetGroup: BudgetGroup
  editing: boolean
  onEditingChange: (editing: boolean) => void
  htmlFor: string
}) {
  const [name, setName] = useState(budgetGroup.name)
  const [pending, run] = useAction()
  const save = () => {
    const trimmed = name.trim()
    onEditingChange(false)
    if (trimmed === '' || trimmed === budgetGroup.name) {
      setName(budgetGroup.name)
      return
    }
    run(() => updateBudgetGroupAction({ key: budgetGroup.key, name: trimmed }))
  }
  if (editing) {
    return (
      <Input
        ref={focusOnMount}
        value={name}
        maxLength={40}
        aria-label="Nome do grupo"
        className="h-7 min-w-0 px-2 text-sm"
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') {
            setName(budgetGroup.name)
            onEditingChange(false)
          }
        }}
      />
    )
  }
  return (
    <label
      htmlFor={htmlFor}
      className="min-w-0 truncate text-sm"
      onDoubleClick={() => onEditingChange(true)}
    >
      {pending ? name : budgetGroup.name}
      {budgetGroup.archived && (
        <span className="text-muted-foreground ml-1 text-xs">(arquivado)</span>
      )}
    </label>
  )
}

export function BudgetGroupMenu({
  budgetGroup,
  onRename,
}: {
  budgetGroup: BudgetGroup
  onRename: () => void
}) {
  const [, run] = useAction()
  const remove = () =>
    run(async () => {
      const result = await removeBudgetGroupAction(budgetGroup.key)
      if (result.ok) {
        toast.success(
          result.archived === true
            ? `"${budgetGroup.name}" foi arquivado: ele tem transações, então continua no histórico.`
            : `"${budgetGroup.name}" excluído.`,
        )
      }
      return result
    })
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Ações do grupo ${budgetGroup.name}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onSelect={onRename}>
          <Pencil /> Renomear
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
          Como medir
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={budgetGroup.goal}
          onValueChange={(goal) =>
            goal !== budgetGroup.goal &&
            run(() =>
              updateBudgetGroupAction({
                key: budgetGroup.key,
                goal: goal === 'minimum' ? 'minimum' : 'limit',
              }),
            )
          }
        >
          {(['limit', 'minimum'] as const satisfies readonly BudgetGroupGoal[]).map((goal) => (
            <DropdownMenuRadioItem key={goal} value={goal}>
              {GROUP_GOAL_LABELS[goal]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        {budgetGroup.archived ? (
          <DropdownMenuItem
            onSelect={() =>
              run(() => updateBudgetGroupAction({ key: budgetGroup.key, archived: false }))
            }
          >
            <RotateCcw /> Restaurar
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem variant="destructive" onSelect={remove}>
            <Trash2 /> Excluir
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function NewBudgetGroupRow({
  budgetGroups,
  onCancel,
}: {
  budgetGroups: readonly BudgetGroup[]
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [pending, run] = useAction()
  const create = () => {
    const trimmed = name.trim()
    if (trimmed === '') return
    run(
      () => createBudgetGroupAction({ name: trimmed, color: nextBudgetGroupColor(budgetGroups) }),
      `Grupo "${trimmed}" criado. Dê a ele uma fatia da renda e salve as metas.`,
      onCancel,
    )
  }
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        create()
      }}
    >
      <Input
        ref={focusOnMount}
        value={name}
        maxLength={40}
        placeholder="Nome do grupo (ex.: Viagens)"
        aria-label="Nome do novo grupo"
        className="h-8"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      />
      <Button type="submit" size="sm" disabled={pending || name.trim() === ''}>
        {pending && <Loader2 className="animate-spin" />}
        Criar grupo
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
        Cancelar
      </Button>
    </form>
  )
}
