'use client'

import {
  addKnownTag,
  DEFAULT_PARTS,
  partsPercentTotal,
  tagSuggestions,
  type PartDraft,
} from '@/features/ledger/core/entry-form'
import { KIND_LABELS } from '@/features/ledger/core/labels'
import type { EntryKind } from '@/features/ledger/core/types'
import { Badge, Button, Checkbox, cn, Input, Label } from '@cbrl/design'
import { Plus, X } from 'lucide-react'
import type * as React from 'react'
import { useId, useState } from 'react'

const KINDS: readonly EntryKind[] = ['income', 'expense', 'transfer']

/** "Estorno/reembolso": an expense that brings money back (stored positive). */
export function RefundCheckbox({
  id,
  checked,
  onChange,
}: {
  id: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(c) => onChange(c === true)} />
      <Label htmlFor={id} className="text-sm font-normal">
        Estorno/reembolso
      </Label>
    </div>
  )
}

/** Entrada | Saída | Transferência (or just the `kinds` given). */
export function KindToggle({
  value,
  onChange,
  kinds = KINDS,
}: {
  value: EntryKind
  onChange: (kind: EntryKind) => void
  kinds?: readonly EntryKind[]
}) {
  return (
    <div
      role="group"
      aria-label="Tipo"
      className="bg-muted grid auto-cols-fr grid-flow-col gap-1 rounded-lg p-1"
    >
      {kinds.map((kind) => (
        <Button
          key={kind}
          type="button"
          size="sm"
          variant={value === kind ? 'outline' : 'ghost'}
          aria-pressed={value === kind}
          className={cn(value === kind && 'bg-background font-semibold shadow-sm')}
          onClick={() => onChange(kind)}
        >
          {KIND_LABELS[kind]}
        </Button>
      ))}
    </div>
  )
}

/**
 * The description as a big underlined title, like Google Calendar's event
 * title: the one field that leaves the standard input look, on purpose.
 */
export function TitleInput({
  size = 'lg',
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, 'size'> & { size?: 'md' | 'lg' }) {
  return (
    <Input
      autoComplete="off"
      placeholder="Adicionar descrição"
      {...props}
      className={cn(
        'focus-visible:border-b-primary rounded-none border-0 border-b-2 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent',
        size === 'lg' ? 'h-12 text-2xl md:text-2xl' : 'h-11 text-xl md:text-xl',
        className,
      )}
    />
  )
}

/**
 * Tag chips (Enter or comma adds what was typed) with an autocomplete of the
 * tags already in use: arrows move through it, Enter or a click picks one.
 */
export function TagsField({
  tags,
  suggestions,
  onChange,
}: {
  tags: string[]
  /** Every tag already in use, sorted. */
  suggestions: readonly string[]
  onChange: (tags: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const listId = useId()
  const options = open ? tagSuggestions(suggestions, tags, draft) : []
  const highlighted = options[active]

  const add = (tag: string) => {
    onChange(addKnownTag(tags, suggestions, tag))
    setDraft('')
    setActive(-1)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      if (options.length === 0) return
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (i + step + options.length) % options.length)
    } else if (e.key === 'Escape') {
      // Only the list closes: the sheet skips Escape on an expanded combobox.
      setOpen(false)
    } else if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      add(highlighted ?? draft)
    }
  }

  return (
    <div className="grid gap-1.5">
      <Label htmlFor="entry-tags">Tags</Label>
      <div className="relative">
        <Input
          id="entry-tags"
          role="combobox"
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={highlighted === undefined ? undefined : `${listId}-${active}`}
          autoComplete="off"
          value={draft}
          placeholder="Ex.: viagem, casa"
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setDraft(e.target.value)
            setActive(-1)
            setOpen(true)
          }}
          onBlur={() => {
            setOpen(false)
            if (draft.trim() !== '') add(draft)
          }}
          onKeyDown={onKeyDown}
        />
        {options.length > 0 && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Tags em uso"
            className="bg-popover text-popover-foreground absolute inset-x-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-md border p-1 shadow-md"
          >
            {options.map((tag, index) => (
              <li
                key={tag}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                className={cn(
                  'hover:bg-accent hover:text-accent-foreground cursor-default rounded-sm px-2 py-1.5 text-sm',
                  index === active && 'bg-accent text-accent-foreground',
                )}
                // On mouse down, keeping the focus in the input: a blur would add the
                // half-typed draft. The keyboard picks through the input (combobox).
                onMouseDown={(e) => {
                  e.preventDefault()
                  add(tag)
                }}
              >
                #{tag}
              </li>
            ))}
          </ul>
        )}
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              #{tag}
              <button
                type="button"
                aria-label={`Remover tag ${tag}`}
                onClick={() => onChange(tags.filter((t) => t !== tag))}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  )
}

/** "Dividir em mais de uma data": parts with label, %, day and "mês seguinte". */
export function PartsEditor({
  split,
  parts,
  onChange,
}: {
  split: boolean
  parts: PartDraft[]
  onChange: (split: boolean, parts: PartDraft[]) => void
}) {
  const total = partsPercentTotal(parts)
  const update = (index: number, patch: Partial<PartDraft>) =>
    onChange(
      true,
      parts.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    )
  return (
    <div className="border-border grid gap-3 rounded-md border p-3">
      <div className="flex items-center gap-2">
        <Checkbox
          id="entry-split"
          checked={split}
          onCheckedChange={(checked) =>
            onChange(checked === true, checked === true ? [...DEFAULT_PARTS] : [])
          }
        />
        <Label htmlFor="entry-split" className="font-normal">
          Dividir em mais de uma data (ex.: adiantamento + saldo)
        </Label>
      </div>
      {split && (
        <>
          {parts.map((part, index) => (
            <div key={index} className="flex flex-wrap items-center gap-2">
              <Input
                aria-label={`Nome da parte ${index + 1}`}
                value={part.label}
                className="w-32"
                onChange={(e) => update(index, { label: e.target.value })}
              />
              <Input
                aria-label={`Percentual da parte ${index + 1}`}
                inputMode="decimal"
                value={part.percent}
                className="w-16"
                onChange={(e) => update(index, { percent: e.target.value })}
              />
              <span className="text-muted-foreground text-sm">% dia</span>
              <Input
                aria-label={`Dia da parte ${index + 1}`}
                inputMode="numeric"
                value={part.day}
                className="w-14"
                onChange={(e) => update(index, { day: e.target.value })}
              />
              <div className="flex items-center gap-1.5">
                <Checkbox
                  id={`entry-part-next-${index}`}
                  checked={part.nextMonth}
                  onCheckedChange={(checked) => update(index, { nextMonth: checked === true })}
                />
                <Label htmlFor={`entry-part-next-${index}`} className="text-sm font-normal">
                  mês seguinte
                </Label>
              </div>
              {parts.length > 2 && (
                <Button
                  type="button"
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Remover parte ${index + 1}`}
                  onClick={() =>
                    onChange(
                      true,
                      parts.filter((_, i) => i !== index),
                    )
                  }
                >
                  <X />
                </Button>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between gap-2">
            <Badge
              variant={total === 100 ? 'secondary' : 'destructive'}
              className={cn(total === 100 && 'text-success')}
            >
              soma {total.toLocaleString('pt-BR')}%
            </Badge>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() =>
                onChange(true, [
                  ...parts,
                  { label: 'Parte', percent: '0', day: '1', nextMonth: false },
                ])
              }
            >
              <Plus /> Parte
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
