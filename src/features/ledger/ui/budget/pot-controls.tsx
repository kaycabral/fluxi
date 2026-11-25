'use client'

import {
  createPotAction,
  removePotAction,
  updatePotAction,
} from '@/features/ledger/adapters/actions/budget'
import { nextPotColor } from '@/features/ledger/core/budget'
import { POT_COLOR_LABELS, POT_DOT_CLASSES, POT_GOAL_LABELS } from '@/features/ledger/core/labels'
import { POT_COLORS, type Pot, type PotColor, type PotGoal } from '@/features/ledger/core/types'
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

/** Inline controls of one pot in "Potes da renda": color, name, menu, and the new-pot row. */

export function ColorPicker({ pot }: { pot: Pot }) {
  const [open, setOpen] = useState(false)
  const [, run] = useAction()
  const pick = (color: PotColor) => {
    setOpen(false)
    if (color !== pot.color) run(() => updatePotAction({ key: pot.key, color }))
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Cor do pote ${pot.name}`}
          className={cn(
            'focus-visible:ring-ring size-3.5 shrink-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
            POT_DOT_CLASSES[pot.color],
          )}
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div className="grid grid-cols-7 gap-1.5" role="radiogroup" aria-label="Cor">
          {POT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={color === pot.color}
              aria-label={POT_COLOR_LABELS[color]}
              title={POT_COLOR_LABELS[color]}
              onClick={() => pick(color)}
              className={cn(
                'focus-visible:ring-ring flex size-6 items-center justify-center rounded-md text-white outline-none focus-visible:ring-2',
                POT_DOT_CLASSES[color],
              )}
            >
              {color === pot.color && <Check className="size-3.5" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** Pot name that turns into an input to rename (Enter saves, Esc cancels). */
export function PotName({
  pot,
  editing,
  onEditingChange,
  htmlFor,
}: {
  pot: Pot
  editing: boolean
  onEditingChange: (editing: boolean) => void
  htmlFor: string
}) {
  const [name, setName] = useState(pot.name)
  const [pending, run] = useAction()
  const save = () => {
    const trimmed = name.trim()
    onEditingChange(false)
    if (trimmed === '' || trimmed === pot.name) {
      setName(pot.name)
      return
    }
    run(() => updatePotAction({ key: pot.key, name: trimmed }))
  }
  if (editing) {
    return (
      <Input
        ref={focusOnMount}
        value={name}
        maxLength={40}
        aria-label="Nome do pote"
        className="h-7 min-w-0 px-2 text-sm"
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save()
          if (e.key === 'Escape') {
            setName(pot.name)
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
      {pending ? name : pot.name}
      {pot.archived && <span className="text-muted-foreground ml-1 text-xs">(arquivado)</span>}
    </label>
  )
}

export function PotMenu({ pot, onRename }: { pot: Pot; onRename: () => void }) {
  const [, run] = useAction()
  const remove = () =>
    run(async () => {
      const result = await removePotAction(pot.key)
      if (result.ok) {
        toast.success(
          result.archived === true
            ? `"${pot.name}" foi arquivado: ele tem lançamentos, então continua no histórico.`
            : `"${pot.name}" excluído.`,
        )
      }
      return result
    })
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Ações do pote ${pot.name}`}>
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
          value={pot.goal}
          onValueChange={(goal) =>
            goal !== pot.goal &&
            run(() =>
              updatePotAction({ key: pot.key, goal: goal === 'minimum' ? 'minimum' : 'limit' }),
            )
          }
        >
          {(['limit', 'minimum'] as const satisfies readonly PotGoal[]).map((goal) => (
            <DropdownMenuRadioItem key={goal} value={goal}>
              {POT_GOAL_LABELS[goal]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        {pot.archived ? (
          <DropdownMenuItem
            onSelect={() => run(() => updatePotAction({ key: pot.key, archived: false }))}
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

export function NewPotRow({ pots, onCancel }: { pots: readonly Pot[]; onCancel: () => void }) {
  const [name, setName] = useState('')
  const [pending, run] = useAction()
  const create = () => {
    const trimmed = name.trim()
    if (trimmed === '') return
    run(
      () => createPotAction({ name: trimmed, color: nextPotColor(pots) }),
      `Pote "${trimmed}" criado. Dê a ele uma fatia da renda e salve as metas.`,
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
        placeholder="Nome do pote (ex.: Viagens)"
        aria-label="Nome do novo pote"
        className="h-8"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      />
      <Button type="submit" size="sm" disabled={pending || name.trim() === ''}>
        {pending && <Loader2 className="animate-spin" />}
        Criar
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
        Cancelar
      </Button>
    </form>
  )
}
