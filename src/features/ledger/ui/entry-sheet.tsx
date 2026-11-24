'use client'

import {
  createEntryAction,
  deleteEntryAction,
  updateEntryAction,
} from '@/features/ledger/adapters/actions/entries'
import type { ActionResult } from '@/features/ledger/core/action-result'
import {
  describeOccurrenceChange,
  isEmptyPatch,
  isOccurrenceEdit,
  newEntryValues,
  occurrencePatchOf,
  valuesToFields,
  type EditTarget,
  type EntryFormValues,
} from '@/features/ledger/core/entry-form'
import { monthLabel } from '@/features/ledger/core/format'
import { RECURRENCE_LABELS } from '@/features/ledger/core/labels'
import type { EntryFields } from '@/features/ledger/core/schemas'
import type { EditScope } from '@/features/ledger/core/scoped-edit'
import { isPotKey, type EntryKind, type Recurrence } from '@/features/ledger/core/types'
import type { LedgerRefs } from '@/features/ledger/core/view'
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Label,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@cbrl/design'
import { ChevronDown, Loader2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { KindToggle, PartsEditor, TagsField } from './entry-fields'
import type { ScopeRequest } from './scope-dialog'
import { AccountSelect, CategorySelect, OptionSelect, PotSelect } from './selects'

const RECURRENCE_OPTIONS = Object.entries(RECURRENCE_LABELS)

function isRecurrence(value: string): value is Recurrence {
  return value in RECURRENCE_LABELS
}

export type EntryFormProps = {
  refs: LedgerRefs
  target: EditTarget | null
  initial: EntryFormValues
  requestScope: (request: ScopeRequest) => Promise<EditScope | null>
  onDone: () => void
}

/** The single entry form (create / edit an occurrence / edit a whole entry), rendered inside the sheet. */
export function EntryForm({
  refs,
  target: initialTarget,
  initial,
  requestScope,
  onDone,
}: EntryFormProps) {
  const [target, setTarget] = useState(initialTarget)
  const [values, setValues] = useState(initial)
  const [entryId, setEntryId] = useState(() => crypto.randomUUID())
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const set = (patch: Partial<EntryFormValues>) => setValues((v) => ({ ...v, ...patch }))

  const usedAccountIds = new Set([target?.entry.accountId, target?.entry.toAccountId])
  const accounts = refs.accounts.filter((a) => !a.archived || usedAccountIds.has(a.id))
  const occurrence = isOccurrenceEdit(target) && target !== null ? target.month : null
  const isTransfer = values.kind === 'transfer'

  function changeKind(kind: EntryKind) {
    const category = refs.categories.find((c) => c.id === values.categoryId)
    set({
      kind,
      pot: kind === 'expense' ? values.pot || category?.defaultPot || 'variable' : '',
      toAccountId:
        kind === 'transfer' && values.toAccountId === ''
          ? (accounts.find((a) => a.id !== values.accountId)?.id ?? '')
          : values.toAccountId,
    })
  }

  function changeCategory(categoryId: string) {
    const suggested = refs.categories.find((c) => c.id === categoryId)?.defaultPot
    set({ categoryId, pot: values.kind === 'expense' && suggested ? suggested : values.pot })
  }

  /**
   * The scope of an occurrence edit, asked BEFORE the transition starts: state
   * updates inside an async transition only commit when it ends, so a dialog
   * opened from inside it would never show. `undefined` = cancelled.
   */
  async function editScope(fields: EntryFields): Promise<EditScope | null | undefined> {
    if (target === null || occurrence === null) return null
    const patch = occurrencePatchOf(target, fields)
    if (isEmptyPatch(patch)) return null
    const scope = await requestScope({
      kind: 'edit',
      description: describeOccurrenceChange(target, occurrence, patch),
    })
    return scope ?? undefined
  }

  async function save(again: boolean) {
    const converted = valuesToFields(values)
    if (!converted.ok) {
      setError(converted.error)
      return
    }
    setError(null)
    const scope = await editScope(converted.fields)
    if (scope === undefined) return
    startTransition(async () => {
      const result: ActionResult =
        target === null
          ? await createEntryAction({ id: entryId, fields: converted.fields })
          : await updateEntryAction({
              entryId: target.entry.id,
              month: occurrence,
              scope,
              fields: converted.fields,
            })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success('Lançamento salvo.')
      if (!again) return onDone()
      setValues(
        newEntryValues({ date: values.date, accountId: values.accountId, kind: values.kind }),
      )
      setEntryId(crypto.randomUUID())
    })
  }

  async function remove() {
    if (target === null) return
    let scope: EditScope = 'all'
    if (occurrence !== null) {
      const chosen = await requestScope({
        kind: 'delete',
        description: `${target.entry.description} em ${monthLabel(occurrence)}`,
      })
      if (chosen === null) return
      scope = chosen
    }
    startTransition(async () => {
      const result = await deleteEntryAction({ entryId: target.entry.id, month: occurrence, scope })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success('Lançamento excluído.')
      onDone()
    })
  }

  function duplicate() {
    setTarget(null)
    setEntryId(crypto.randomUUID())
    set({ description: `${values.description} (cópia)` })
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault()
        void save(false)
      }}
    >
      <SheetHeader className="pr-12">
        <SheetTitle>{target === null ? 'Novo lançamento' : 'Editar lançamento'}</SheetTitle>
        <SheetDescription className={occurrence === null ? 'sr-only' : undefined}>
          {occurrence === null
            ? 'Preencha os dados do lançamento.'
            : `Editando ${monthLabel(occurrence)}. Se mudar valor ou dia, você escolhe o alcance ao salvar.`}
        </SheetDescription>
      </SheetHeader>

      <div className="grid gap-4 overflow-y-auto px-4 pb-4">
        <KindToggle value={values.kind} onChange={changeKind} />

        <div className="grid gap-2">
          <Label htmlFor="entry-amount">Valor (R$)</Label>
          <Input
            id="entry-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            className="h-12 font-mono text-2xl md:text-2xl"
            value={values.amount}
            onChange={(e) => set({ amount: e.target.value })}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="entry-description">Descrição</Label>
          <Input
            id="entry-description"
            list="entry-descriptions"
            autoComplete="off"
            placeholder="Ex.: Mercado, Salário, Aporte CDB"
            value={values.description}
            onChange={(e) => set({ description: e.target.value })}
          />
          <datalist id="entry-descriptions">
            {refs.descriptions.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </div>

        <div className="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2 [&>*]:min-w-0">
          <div className="grid gap-2">
            <Label htmlFor="entry-date">Data</Label>
            <Input
              id="entry-date"
              type="date"
              value={values.date}
              onChange={(e) => set({ date: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="entry-account">Conta</Label>
            <AccountSelect
              id="entry-account"
              banks={refs.banks}
              accounts={accounts}
              value={values.accountId}
              onValueChange={(accountId) => set({ accountId })}
            />
          </div>
          {isTransfer ? (
            <div className="grid gap-2">
              <Label htmlFor="entry-to-account">Para a conta</Label>
              <AccountSelect
                id="entry-to-account"
                banks={refs.banks}
                accounts={accounts}
                value={values.toAccountId}
                onValueChange={(toAccountId) => set({ toAccountId })}
              />
            </div>
          ) : (
            <>
              <div className="grid gap-2">
                <Label htmlFor="entry-category">Categoria</Label>
                <CategorySelect
                  id="entry-category"
                  categories={refs.categories.filter(
                    (c) => !c.archived || c.id === values.categoryId,
                  )}
                  emptyLabel="Sem categoria"
                  value={values.categoryId}
                  onValueChange={changeCategory}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="entry-pot">Pote</Label>
                <PotSelect
                  id="entry-pot"
                  value={values.kind === 'expense' ? values.pot : ''}
                  placeholder={values.kind === 'income' ? '– (entrada)' : '–'}
                  disabled={values.kind !== 'expense'}
                  onValueChange={(pot) => set({ pot: isPotKey(pot) ? pot : '' })}
                />
              </div>
            </>
          )}
          <div className="grid gap-2">
            <Label htmlFor="entry-recurrence">Repete</Label>
            <OptionSelect
              id="entry-recurrence"
              options={RECURRENCE_OPTIONS}
              value={values.recurrence}
              onValueChange={(v) => {
                if (isRecurrence(v))
                  set({ recurrence: v, installments: values.installments || '12' })
              }}
            />
          </div>
          {values.recurrence === 'installments' && (
            <div className="grid gap-2">
              <Label htmlFor="entry-installments">Parcelas</Label>
              <Input
                id="entry-installments"
                type="number"
                min={1}
                inputMode="numeric"
                value={values.installments}
                onChange={(e) => set({ installments: e.target.value })}
              />
            </div>
          )}
          {(values.recurrence === 'monthly' || values.recurrence === 'yearly') && (
            <div className="grid gap-2">
              <Label htmlFor="entry-end">Até (opcional)</Label>
              <Input
                id="entry-end"
                type="month"
                value={values.endMonth}
                onChange={(e) => set({ endMonth: e.target.value })}
              />
            </div>
          )}
        </div>
        {values.kind === 'expense' && (
          <p className="text-muted-foreground -mt-2 text-xs">
            O pote é sugerido pela categoria; troque se quiser.
          </p>
        )}

        <TagsField tags={values.tags} onChange={(tags) => set({ tags })} />

        <Collapsible defaultOpen={values.split}>
          <CollapsibleTrigger className="text-primary flex items-center gap-1 text-sm font-medium [&[data-state=open]>svg]:rotate-180">
            Mais opções <ChevronDown className="size-4 transition-transform" />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <PartsEditor
              split={values.split}
              parts={values.parts}
              onChange={(split, parts) => set({ split, parts })}
            />
          </CollapsibleContent>
        </Collapsible>

        {error !== null && (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        )}
      </div>

      <SheetFooter className="border-border flex-row flex-wrap items-center justify-between border-t">
        <div className="flex gap-1">
          {target !== null && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => void remove()}
                disabled={pending}
              >
                Excluir
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={duplicate}
                disabled={pending}
              >
                Duplicar
              </Button>
            </>
          )}
        </div>
        <div className="flex gap-2">
          {target === null && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void save(true)}
              disabled={pending}
            >
              Salvar e criar outro
            </Button>
          )}
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Salvar
          </Button>
        </div>
      </SheetFooter>
    </form>
  )
}
