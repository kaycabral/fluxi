'use client'

import {
  addTag,
  DEFAULT_PARTS,
  partsPercentTotal,
  type PartDraft,
} from '@/features/ledger/core/entry-form'
import { KIND_LABELS } from '@/features/ledger/core/labels'
import type { EntryKind } from '@/features/ledger/core/types'
import { Badge, Button, Checkbox, cn, Input, Label } from '@cbrl/design'
import { Plus, X } from 'lucide-react'
import { useState } from 'react'

const KINDS: EntryKind[] = ['income', 'expense', 'transfer']

/** Entrada | Saída | Transferência. */
export function KindToggle({
  value,
  onChange,
}: {
  value: EntryKind
  onChange: (kind: EntryKind) => void
}) {
  return (
    <div role="group" aria-label="Tipo" className="bg-muted grid grid-cols-3 gap-1 rounded-lg p-1">
      {KINDS.map((kind) => (
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

/** Free-text tag chips (Enter or comma adds). */
export function TagsField({
  tags,
  onChange,
}: {
  tags: string[]
  onChange: (tags: string[]) => void
}) {
  const [draft, setDraft] = useState('')
  const commit = () => {
    onChange(addTag(tags, draft))
    setDraft('')
  }
  return (
    <div className="grid gap-2">
      <Label htmlFor="entry-tags">Tags</Label>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
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
      <Input
        id="entry-tags"
        value={draft}
        placeholder="Ex.: viagem, casa"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft.trim() !== '' && commit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            commit()
          }
        }}
      />
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
              className={cn(total === 100 && 'text-emerald-700 dark:text-emerald-400')}
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
