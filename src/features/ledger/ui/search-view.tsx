'use client'

import { accountLabel } from '@/features/ledger/core/account-filter'
import { shortDate } from '@/features/ledger/core/format'
import { budgetGroupDot, paidLabel, RECURRENCE_LABELS } from '@/features/ledger/core/labels'
import { paymentFor } from '@/features/ledger/core/payments'
import {
  activeFilters,
  EMPTY_SEARCH_QUERY,
  landingBounds,
  ledgerSpan,
  pickerRange,
  searchAccountIds,
  searchOccurrences,
  searchTotals,
  searchWindow,
  SORT_LABELS,
  type ActiveFilter,
  type KindFilter,
  type MoneyFilter,
  type Occurrence,
  type SearchQuery,
  type SearchTotals,
  type SortOrder,
  type StatusFilter,
} from '@/features/ledger/core/search'
import {
  distinctTags,
  installmentLabel,
  projectWindow,
  targetFor,
  type LedgerData,
} from '@/features/ledger/core/view'
import {
  Badge,
  Button,
  Checkbox,
  cn,
  DateField,
  Field,
  FieldGroup,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  List,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Typography,
} from '@cbrl/design'
import { ListChecks, Plus, Search, SlidersHorizontal, X } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { BankMark } from './bank-mark'
import { useLedgerUi } from './ledger-shell'
import { Money } from './money'
import { SelectionBar, useEntrySelection } from './selection-bar'
import { AccountSelect, BudgetGroupSelect, CategorySelect, OptionSelect } from './selects'
import { rememberSearchQuery } from './transactions-link'

const PAGE_SIZE = 50

const SORT_OPTIONS = [
  ['desc', SORT_LABELS.desc],
  ['asc', SORT_LABELS.asc],
] as const

function isSort(value: string): value is SortOrder {
  return value === 'desc' || value === 'asc'
}

const KIND_OPTIONS = [
  ['', 'Todos'],
  ['income', 'Entradas'],
  ['expense', 'Saídas'],
  ['transfer', 'Transferências'],
] as const

const STATUS_OPTIONS = [
  ['', 'Todos'],
  ['paid', 'Pagos'],
  ['unpaid', 'Não pagos'],
] as const

const MONEY_OPTIONS = [
  ['', 'Tudo'],
  ['available', 'Disponível'],
  ['benefit', 'Benefícios'],
] as const

function isKind(value: string): value is KindFilter {
  return KIND_OPTIONS.some(([k]) => k === value)
}

function isStatus(value: string): value is StatusFilter {
  return STATUS_OPTIONS.some(([k]) => k === value)
}

function isMoney(value: string): value is MoneyFilter {
  return MONEY_OPTIONS.some(([k]) => k === value)
}

type Props = {
  /** The whole ledger (the list filters it on the client). */
  data: LedgerData
  /** The query this browser left last time (cookie). */
  initialQuery: SearchQuery
  /** `YYYY-MM-DD`. */
  today: string
}

/**
 * "Transações": every occurrence of the ledger as a flat list, newest first,
 * with a live search box and the other filters behind a "Filtros" button.
 * Everything runs on the client over the loaded ledger, so typing never
 * reaches the server; the query is remembered per browser.
 */
export function SearchView({ data, initialQuery, today }: Props) {
  const { openEdit, openNew } = useLedgerUi()
  const [query, setQuery] = useState(initialQuery)
  const [page, setPage] = useState(1)
  const { selecting, selected, toggleSelected, setSelecting, stopSelecting, clearSelected } =
    useEntrySelection()
  // Typing stays instant; filtering a long ledger renders at lower priority.
  const applied = useDeferredValue(query)

  const update = (patch: Partial<SearchQuery>) => {
    const next = { ...query, ...patch }
    const fixed =
      next.from !== '' && next.to !== '' && next.to < next.from ? { ...next, to: next.from } : next
    setQuery(fixed)
    setPage(1)
    rememberSearchQuery(fixed)
  }

  const ctx = useMemo(
    () => ({
      accounts: data.accounts,
      banks: data.banks,
      categories: data.categories,
      budgetGroups: data.budgetGroups,
      payments: data.payments,
    }),
    [data],
  )
  const span = useMemo(() => ledgerSpan(data.entries, today.slice(0, 7)), [data.entries, today])
  const window = searchWindow(span, applied)
  const results = useMemo(
    () => projectWindow(data, window.from, window.to),
    [data, window.from, window.to],
  )
  const occurrences = useMemo(
    () => searchOccurrences(results, applied, ctx),
    [results, applied, ctx],
  )
  const chips = activeFilters(query, ctx).filter((c) => c.key !== 'text')
  const filtered = searchAccountIds(applied, data.accounts) !== null
  const pageCount = Math.max(1, Math.ceil(occurrences.length / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const visible = occurrences.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const anyFilter = query.text.trim() !== '' || chips.length > 0
  const totals = useMemo(() => searchTotals(occurrences), [occurrences])
  const bounds = useMemo(() => landingBounds(results, span), [results, span])

  const label = (id: string | null) => accountLabel(id, data.accounts, data.banks)
  const clearFilters = () => update({ ...EMPTY_SEARCH_QUERY, text: query.text })
  const clearChip = (key: ActiveFilter['key']) => {
    if (key === 'period') update({ from: '', to: '' })
    else if (key === 'sort') update({ sort: EMPTY_SEARCH_QUERY.sort })
    else update({ [key]: '' })
  }

  return (
    // One column that may shrink below its content: the list rows truncate
    // instead of widening the page on a phone.
    <div className="grid grid-cols-1 gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <Typography variant="pageTitle" as="h1">
            Transações
          </Typography>
          <Summary count={occurrences.length} totals={totals} />
        </div>
        <Button size="lg" onClick={() => openNew()} aria-keyshortcuts="N">
          <Plus /> Nova transação
        </Button>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <InputGroup className="sm:max-w-xs">
          <InputGroupAddon align="inline-start">
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            value={query.text}
            onChange={(e) => update({ text: e.target.value })}
            placeholder="Buscar por descrição"
            aria-label="Buscar transações"
          />
        </InputGroup>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            variant={selecting ? 'secondary' : 'outline'}
            size="sm"
            aria-pressed={selecting}
            onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
          >
            <ListChecks /> {selecting ? 'Concluir' : 'Selecionar'}
          </Button>
          <FiltersPopover
            data={data}
            query={query}
            count={chips.length}
            range={pickerRange(bounds, today)}
            onChange={update}
            onClear={clearFilters}
          />
        </div>
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <FilterChip key={chip.key} chip={chip} onClear={() => clearChip(chip.key)} />
          ))}
          <Button variant="link" size="xs" onClick={clearFilters}>
            Limpar filtros
          </Button>
        </div>
      )}
      <List<Occurrence>
        items={visible}
        getKey={({ landing }, index) =>
          `${landing.entry.id}-${landing.month}-${landing.part?.id ?? 'whole'}-${index}`
        }
        empty={emptyList(anyFilter, data.accounts.length > 0)}
        pagination={{
          page: current,
          pageCount,
          onPageChange: setPage,
          labels: {
            root: 'Paginação',
            previous: 'Página anterior',
            next: 'Próxima página',
            page: (n) => `Página ${n}`,
          },
        }}
        renderItem={({ landing, valueCents }) => {
          const { entry } = landing
          const paid = paymentFor(landing, data.payments) !== undefined
          const date = shortDate(landing.month, landing.day)
          const category = data.categories.find((c) => c.id === entry.categoryId)?.name
          const account =
            entry.kind === 'transfer'
              ? `${label(entry.accountId)} → ${label(entry.toAccountId)}`
              : label(entry.accountId)
          const isSelected = selected.has(entry.id)
          return {
            leading: selecting ? (
              <Checkbox
                checked={isSelected}
                aria-label={`Selecionar ${entry.description}`}
                onCheckedChange={() => toggleSelected(entry.id)}
              />
            ) : (
              <span
                aria-hidden
                className={cn(
                  'size-2.5 shrink-0 rounded-xs',
                  budgetGroupDot(entry.budgetGroup, data.budgetGroups),
                )}
              />
            ),
            title: entry.description,
            badge: (
              <span className="hidden gap-1 sm:flex">
                {landing.part !== null && <Badge variant="outline">{landing.part.label}</Badge>}
                {entry.recurrence !== 'none' && (
                  <Badge variant="outline">
                    {installmentLabel(landing) ?? RECURRENCE_LABELS[entry.recurrence]}
                  </Badge>
                )}
              </span>
            ),
            description: (
              <>
                {/* The meta column (the date) only shows from `sm` up. */}
                <span className="sm:hidden">{date} · </span>
                {entry.fromBank && <BankMark className="mr-1" />}
                {[entry.merchantName, account, category].filter(Boolean).join(' · ')}
              </>
            ),
            meta: date,
            trailing:
              entry.kind === 'transfer' && !filtered ? (
                <span className="text-muted-foreground text-xs font-normal">interna</span>
              ) : (
                <Money cents={valueCents} tone />
              ),
            trailingHint: paid ? paidLabel(landing.amountCents) : undefined,
            // While selecting, the row is not a button: the checkbox is the control.
            onClick: selecting ? undefined : () => openEdit(targetFor(data, landing)),
          }
        }}
      />
      {selecting && (
        <SelectionBar
          entryIds={[...selected]}
          categories={data.categories}
          budgetGroups={data.budgetGroups}
          onClear={clearSelected}
        />
      )}
    </div>
  )
}

/**
 * Count and sum of what the filters left: the net first (what the selection
 * adds up to), then money in and out, right under the title.
 */
/** What the empty list says: nothing matched, no account to start with, or no transaction yet. */
function emptyList(anyFilter: boolean, hasAccounts: boolean) {
  if (anyFilter) {
    return {
      title: 'Nenhuma transação encontrada',
      description: 'Tente outra busca ou limpe os filtros.',
    }
  }
  if (!hasAccounts) {
    return {
      title: 'Nenhuma conta ainda',
      description: 'Crie uma conta para lançar a primeira entrada ou saída.',
      action: { label: 'Criar conta', href: '#configuracoes/contas' },
    }
  }
  return {
    title: 'Nenhuma transação ainda',
    description: 'Use "Nova transação" para lançar a primeira entrada ou saída.',
  }
}

function Summary({ count, totals }: { count: number; totals: SearchTotals }) {
  return (
    // A polite live region: screen readers hear the new count and sums as filters change.
    <dl
      role="status"
      aria-label="Resumo"
      className="text-muted-foreground flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm"
    >
      <div className="flex gap-1">
        <dt className="sr-only">Quantidade</dt>
        <dd>
          {count} {count === 1 ? 'transação' : 'transações'}
        </dd>
      </div>
      <div className="flex gap-1.5 whitespace-nowrap">
        <dt>Saldo</dt>
        <dd>
          <Money cents={totals.netCents} tone className="font-semibold" />
        </dd>
      </div>
      <div className="flex gap-1.5 whitespace-nowrap">
        <dt>Entradas</dt>
        <dd>
          <Money cents={totals.incomeCents} tone />
        </dd>
      </div>
      <div className="flex gap-1.5 whitespace-nowrap">
        <dt>Saídas</dt>
        <dd>
          <Money cents={totals.expenseCents} tone />
        </dd>
      </div>
    </dl>
  )
}

function FilterChip({ chip, onClear }: { chip: ActiveFilter; onClear: () => void }) {
  return (
    <Button
      variant="secondary"
      size="xs"
      aria-label={`Remover filtro ${chip.label}`}
      onClick={onClear}
    >
      {chip.label}
      <X />
    </Button>
  )
}

function FiltersPopover({
  data,
  query,
  count,
  range,
  onChange,
  onClear,
}: {
  data: LedgerData
  query: SearchQuery
  /** Years the pickers' month/year selects offer (those with occurrences). */
  range: { min: string; max: string }
  /** Filters in use (search text aside), shown on the button. */
  count: number
  onChange: (patch: Partial<SearchQuery>) => void
  onClear: () => void
}) {
  const tags = distinctTags(data.entries)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <SlidersHorizontal /> Filtros
          {count > 0 && <Badge>{count}</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <FieldGroup className="gap-3">
          <Field>
            <FieldLabel htmlFor="q-sort">Ordenar</FieldLabel>
            <OptionSelect
              id="q-sort"
              options={SORT_OPTIONS}
              value={query.sort}
              onValueChange={(sort) => {
                if (isSort(sort)) onChange({ sort })
              }}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="q-from">De</FieldLabel>
              <DateField
                id="q-from"
                value={query.from}
                min={range.min}
                max={range.max}
                captionLayout="dropdown"
                placeholder="Início"
                onValueChange={(from) => onChange({ from })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="q-to">Até</FieldLabel>
              <DateField
                id="q-to"
                value={query.to}
                min={range.min}
                max={range.max}
                captionLayout="dropdown"
                placeholder="Fim"
                onValueChange={(to) => onChange({ to })}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="q-kind">Tipo</FieldLabel>
            <OptionSelect
              id="q-kind"
              options={KIND_OPTIONS}
              value={query.kind}
              onValueChange={(kind) => {
                if (isKind(kind)) onChange({ kind })
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="q-account">Banco ou conta</FieldLabel>
            <AccountSelect
              id="q-account"
              banks={data.banks}
              accounts={data.accounts}
              withBanks
              allLabel="Todas as contas"
              value={query.account}
              onValueChange={(account) => onChange({ account })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="q-money">Dinheiro</FieldLabel>
            <OptionSelect
              id="q-money"
              options={MONEY_OPTIONS}
              value={query.money}
              onValueChange={(money) => {
                if (isMoney(money)) onChange({ money })
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="q-category">Categoria</FieldLabel>
            <CategorySelect
              id="q-category"
              categories={data.categories}
              withGroups
              emptyLabel="Todas"
              value={query.category}
              onValueChange={(category) => onChange({ category })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="q-budget-group">Grupo</FieldLabel>
              <BudgetGroupSelect
                id="q-budget-group"
                allLabel="Todos"
                value={query.budgetGroup}
                budgetGroups={data.budgetGroups}
                onValueChange={(budgetGroup) => onChange({ budgetGroup })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="q-tag">Tag</FieldLabel>
              <OptionSelect
                id="q-tag"
                options={[['', 'Todas'], ...tags.map((t) => [t, `#${t}`] as const)]}
                value={query.tag}
                onValueChange={(tag) => onChange({ tag })}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="q-status">Status</FieldLabel>
            <OptionSelect
              id="q-status"
              options={STATUS_OPTIONS}
              value={query.status}
              onValueChange={(status) => {
                if (isStatus(status)) onChange({ status })
              }}
            />
          </Field>
          <Button variant="ghost" size="sm" disabled={count === 0} onClick={onClear}>
            Limpar filtros
          </Button>
        </FieldGroup>
      </PopoverContent>
    </Popover>
  )
}
