'use client'

import {
  createEntryAction,
  deleteEntryAction,
  updateEntryAction,
} from '@/features/ledger/adapters/actions/entries'
import type { ActionResult } from '@/features/ledger/core/action-result'
import {
  amountLabel,
  deleteMonthOf,
  describeOccurrenceChange,
  installmentsHint,
  isEmptyPatch,
  isOccurrenceEdit,
  newEntryValues,
  occurrencePatchOf,
  valuesToFields,
  type EditTarget,
  type EntryFormValues,
} from '@/features/ledger/core/entry-form'
import { monthLabel } from '@/features/ledger/core/format'
import type { EntryFields } from '@/features/ledger/core/schemas'
import type { EditScope } from '@/features/ledger/core/scoped-edit'
import { isPotKey, type EntryKind } from '@/features/ledger/core/types'
import type { LedgerRefs } from '@/features/ledger/core/view'
import { Button, cn, DateField, DialogDescription, DialogTitle, Input, Label } from '@cbrl/design'
import {
  Banknote,
  Copy,
  Hash,
  Loader2,
  SplitSquareVertical,
  Tag,
  Trash2,
  Wallet,
  X,
} from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { KindToggle, PartsEditor, TagsField, TitleInput } from './entry-fields'
import { MoneyInput } from './money-input'
import { RepeatField } from './repeat-field'
import type { ScopeRequest } from './scope-dialog'
import { AccountSelect, CategorySelect, PotSelect } from './selects'

export type EntryFormProps = {
  refs: LedgerRefs
  target: EditTarget | null
  initial: EntryFormValues
  requestScope: (request: ScopeRequest) => Promise<EditScope | null>
  onDone: () => void
}

/**
 * The single entry form (create / edit an occurrence / edit a whole entry),
 * laid out like Google Calendar's event page: the description as a big title
 * with Salvar beside it, the date and the repetition under it, then the
 * details card (kind, amount, accounts, category and pot, tags, parts).
 */
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
    const month = deleteMonthOf(target)
    let scope: EditScope = 'all'
    if (month !== null) {
      const chosen = await requestScope({
        kind: 'delete',
        description: `${target.entry.description} em ${monthLabel(month)}`,
      })
      if (chosen === null) return
      scope = chosen
    }
    startTransition(async () => {
      const result = await deleteEntryAction({ entryId: target.entry.id, month, scope })
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

  const totalHint = installmentsHint(values)

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault()
        void save(false)
      }}
    >
      <DialogTitle className="sr-only">
        {target === null ? 'Novo lançamento' : 'Editar lançamento'}
      </DialogTitle>
      <DialogDescription className="sr-only">Preencha os dados do lançamento.</DialogDescription>

      <div className="flex items-start gap-2 px-3 pt-3 md:gap-4 md:px-6 md:pt-4">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="mt-1 shrink-0 rounded-full"
          aria-label="Fechar"
          onClick={onDone}
        >
          <X />
        </Button>
        <div className="grid min-w-0 flex-1 gap-3 md:max-w-2xl">
          <TitleInput
            id="entry-description"
            aria-label="Descrição"
            list="entry-descriptions"
            className="[&::-webkit-calendar-picker-indicator]:hidden!"
            value={values.description}
            onChange={(e) => set({ description: e.target.value })}
          />
          <datalist id="entry-descriptions">
            {refs.descriptions.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
          <div className="flex flex-wrap items-center gap-2">
            <DateField
              id="entry-date"
              aria-label="Data"
              className="w-40"
              value={values.date}
              // Incomplete while typing: keep the last full date.
              onValueChange={(date) => date !== '' && set({ date })}
            />
            <RepeatField
              date={values.date}
              withInstallments
              value={values}
              onChange={(repeat) => set(repeat)}
            />
            {values.recurrence === 'installments' && (
              <div className="flex items-center gap-2">
                <Input
                  id="entry-installments"
                  aria-label="Parcelas"
                  type="number"
                  min={1}
                  inputMode="numeric"
                  className="w-20"
                  value={values.installments}
                  onChange={(e) => set({ installments: e.target.value })}
                />
                <span className="text-muted-foreground text-sm">parcelas</span>
              </div>
            )}
          </div>
          {occurrence !== null && (
            <p className="text-muted-foreground text-xs">
              Editando {monthLabel(occurrence)}. Se mudar valor ou dia, você escolhe o alcance ao
              salvar; mudar o mês move o início da repetição.
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {target !== null && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-full"
                aria-label="Excluir"
                onClick={() => void remove()}
                disabled={pending}
              >
                <Trash2 />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-full"
                aria-label="Duplicar"
                onClick={duplicate}
                disabled={pending}
              >
                <Copy />
              </Button>
            </>
          )}
          {target === null && (
            <Button
              type="button"
              variant="ghost"
              className="hidden rounded-full sm:inline-flex"
              onClick={() => void save(true)}
              disabled={pending}
            >
              Salvar e criar outro
            </Button>
          )}
          <Button type="submit" className="rounded-full px-6" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            Salvar
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 md:px-6">
        <section
          aria-label="Detalhes do lançamento"
          className="bg-card grid max-w-2xl gap-5 rounded-3xl border p-4 md:ml-14 md:p-6"
        >
          <h2 className="text-primary border-primary w-fit border-b-2 pb-1 text-sm font-medium">
            Detalhes do lançamento
          </h2>
          <KindToggle value={values.kind} onChange={changeKind} />

          <DetailRow icon={Banknote}>
            <div className="grid gap-1.5">
              <Label htmlFor="entry-amount">{amountLabel(values)}</Label>
              <MoneyInput
                id="entry-amount"
                placeholder="0,00"
                value={values.amount}
                onValueChange={(amount) => set({ amount })}
                aria-describedby={totalHint === null ? undefined : 'entry-amount-total'}
              />
              {totalHint !== null && (
                <p id="entry-amount-total" className="text-muted-foreground text-xs">
                  {totalHint}
                </p>
              )}
            </div>
          </DetailRow>

          <DetailRow icon={Wallet}>
            <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
              <div className="grid gap-1.5">
                <Label htmlFor="entry-account">Conta</Label>
                <AccountSelect
                  id="entry-account"
                  banks={refs.banks}
                  accounts={accounts}
                  value={values.accountId}
                  onValueChange={(accountId) => set({ accountId })}
                />
              </div>
              {isTransfer && (
                <div className="grid gap-1.5">
                  <Label htmlFor="entry-to-account">Para a conta</Label>
                  <AccountSelect
                    id="entry-to-account"
                    banks={refs.banks}
                    accounts={accounts}
                    value={values.toAccountId}
                    onValueChange={(toAccountId) => set({ toAccountId })}
                  />
                </div>
              )}
            </div>
          </DetailRow>

          {!isTransfer && (
            <DetailRow icon={Tag}>
              <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
                <div className="grid gap-1.5">
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
                {/* Pots budget spending only: an income never has one. */}
                {values.kind === 'expense' && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="entry-pot">Pote</Label>
                    <PotSelect
                      id="entry-pot"
                      value={values.pot}
                      onValueChange={(pot) => set({ pot: isPotKey(pot) ? pot : '' })}
                    />
                  </div>
                )}
              </div>
              {values.kind === 'expense' && (
                <p className="text-muted-foreground text-xs">
                  O pote é sugerido pela categoria; troque se quiser.
                </p>
              )}
            </DetailRow>
          )}

          <DetailRow icon={Hash}>
            <TagsField
              tags={values.tags}
              suggestions={refs.tags}
              onChange={(tags) => set({ tags })}
            />
          </DetailRow>

          {/* Splitting is for income paid in parts (advance + balance); an entry already split keeps it. */}
          {(values.kind === 'income' || values.split) && (
            <DetailRow icon={SplitSquareVertical} align="box">
              <PartsEditor
                split={values.split}
                parts={values.parts}
                onChange={(split, parts) => set({ split, parts })}
              />
            </DetailRow>
          )}

          {error !== null && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
        </section>
      </div>
    </form>
  )
}

/**
 * A details row led by its icon, centred on the row's first control: under a
 * label (`field`: the label line plus its gap, then an `h-8` control) or on
 * the first line inside a bordered box (`box`: border + `p-3`, then a
 * checkbox line).
 */
function DetailRow({
  icon: Icon,
  align = 'field',
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  align?: 'field' | 'box'
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[1.25rem_1fr] items-start gap-x-4">
      <span
        className={cn('flex items-center', align === 'field' ? 'mt-5 h-8' : 'mt-[13px] h-4')}
        aria-hidden
      >
        <Icon className="text-muted-foreground size-5" />
      </span>
      <div className="grid min-w-0 gap-2">{children}</div>
    </div>
  )
}
