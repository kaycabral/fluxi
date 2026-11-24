'use client'

import { accountLabel } from '@/features/ledger/core/account-filter'
import { formatMoney, monthLabel, shortDate } from '@/features/ledger/core/format'
import { POT_COLORS, POT_LABELS, potTint, RECURRENCE_LABELS } from '@/features/ledger/core/labels'
import type { Month } from '@/features/ledger/core/month'
import {
  activeFilters,
  drillDown,
  GROUP_KEYS,
  GROUP_LABELS,
  groupOccurrences,
  searchAccountIds,
  searchOccurrences,
  searchQueryToParams,
  searchTotals,
  type ActiveFilter,
  type GroupKey,
  type KindFilter,
  type MoneyFilter,
  type SearchQuery,
  type StatusFilter,
} from '@/features/ledger/core/search'
import { isPotKey } from '@/features/ledger/core/types'
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
  Card,
  CardContent,
  cn,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@cbrl/design'
import { X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { useLedgerUi } from './ledger-shell'
import { Money } from './money'
import { AccountSelect, CategorySelect, MonthSelect, OptionSelect, PotSelect } from './selects'

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

function isStatus(value: string): value is StatusFilter {
  return STATUS_OPTIONS.some(([k]) => k === value)
}

const MONEY_OPTIONS = [
  ['', 'Tudo'],
  ['available', 'Disponível'],
  ['benefit', 'Benefícios'],
] as const

function isMoney(value: string): value is MoneyFilter {
  return MONEY_OPTIONS.some(([k]) => k === value)
}

const GROUP_OPTIONS = [
  ['none', GROUP_LABELS.none],
  ...GROUP_KEYS.map((k) => [k, GROUP_LABELS[k]] as const),
] as const

function isKind(value: string): value is KindFilter {
  return KIND_OPTIONS.some(([k]) => k === value)
}

function isGroup(value: string): value is GroupKey | 'none' {
  return value === 'none' || GROUP_KEYS.some((k) => k === value)
}

type Props = {
  data: LedgerData
  query: SearchQuery
  /** Default start month (for the URL defaults). */
  start: Month
  /** Months offered by De/Até. */
  months: Month[]
}

/** "Lançamentos": filters in the URL, totals, grouped table or the list of occurrences. */
export function SearchView({ data, query, start, months }: Props) {
  const router = useRouter()
  const { openEdit } = useLedgerUi()
  const [text, setText] = useState(query.text)

  const navigate = (next: SearchQuery) => {
    const params = searchQueryToParams(next, start)
    router.replace(params === '' ? '/painel/lancamentos' : `/painel/lancamentos?${params}`, {
      scroll: false,
    })
  }
  const update = (patch: Partial<SearchQuery>) => {
    const next = { ...query, ...patch }
    navigate(next.from > next.to ? { ...next, to: next.from } : next)
  }

  useEffect(() => {
    if (text === query.text) return
    const timer = setTimeout(() => navigate({ ...query, text }), 300)
    return () => clearTimeout(timer)
  })

  const ctx = useMemo(
    () => ({
      accounts: data.accounts,
      banks: data.banks,
      categories: data.categories,
      payments: data.payments,
    }),
    [data],
  )
  const results = useMemo(
    () => projectWindow(data, query.from, query.to),
    [data, query.from, query.to],
  )
  const occurrences = useMemo(() => searchOccurrences(results, query, ctx), [results, query, ctx])
  const totals = searchTotals(occurrences, query)
  const chips = activeFilters(query, ctx)
  const tags = distinctTags(data.entries)
  const filtered = searchAccountIds(query, data.accounts) !== null

  const clearFilter = (key: ActiveFilter['key']) => {
    if (key === 'text') setText('')
    update({ [key]: '' })
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="grid gap-3">
          <form
            role="search"
            className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 md:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault()
              navigate({ ...query, text })
            }}
          >
            <div className="grid gap-1.5 min-[400px]:col-span-2">
              <Label htmlFor="q-text">Descrição contém</Label>
              <Input
                id="q-text"
                name="q"
                value={text}
                placeholder="Ex.: salário, luz, carro"
                onChange={(e) => setText(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="q-from">De</Label>
              <MonthSelect
                id="q-from"
                months={months}
                value={query.from}
                onValueChange={(from) => update({ from })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="q-to">Até</Label>
              <MonthSelect
                id="q-to"
                months={months.filter((m) => m >= query.from)}
                value={query.to}
                onValueChange={(to) => update({ to })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="q-kind">Tipo</Label>
              <OptionSelect
                id="q-kind"
                options={KIND_OPTIONS}
                value={query.kind}
                onValueChange={(kind) => {
                  if (isKind(kind)) update({ kind })
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="q-account">Banco ou conta</Label>
              <AccountSelect
                id="q-account"
                banks={data.banks}
                accounts={data.accounts}
                withBanks
                allLabel="Todas as contas"
                value={query.account}
                onValueChange={(account) => update({ account })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="q-money">Dinheiro</Label>
              <OptionSelect
                id="q-money"
                options={MONEY_OPTIONS}
                value={query.money}
                onValueChange={(money) => {
                  if (isMoney(money)) update({ money })
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="q-category">Categoria</Label>
              <CategorySelect
                id="q-category"
                categories={data.categories}
                withGroups
                emptyLabel="Todas"
                value={query.category}
                onValueChange={(category) => update({ category })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="q-pot">Pote</Label>
              <PotSelect
                id="q-pot"
                allLabel="Todos"
                value={query.pot}
                onValueChange={(pot) => update({ pot: isPotKey(pot) ? pot : '' })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="q-tag">Tag</Label>
              <OptionSelect
                id="q-tag"
                options={[['', 'Todas'], ...tags.map((t) => [t, `#${t}`] as const)]}
                value={query.tag}
                onValueChange={(tag) => update({ tag })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="q-status">Status</Label>
              <OptionSelect
                id="q-status"
                options={STATUS_OPTIONS}
                value={query.status}
                onValueChange={(status) => {
                  if (isStatus(status)) update({ status })
                }}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="q-group">Agrupar por</Label>
              <OptionSelect
                id="q-group"
                options={GROUP_OPTIONS}
                value={query.group}
                onValueChange={(group) => {
                  if (isGroup(group)) update({ group })
                }}
              />
            </div>
          </form>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">
              {monthLabel(query.from)} a {monthLabel(query.to)}
            </Badge>
            {chips.map((chip) => (
              <Badge key={chip.key} variant="secondary" className="gap-1">
                {chip.label}
                <button
                  type="button"
                  aria-label={`Remover filtro ${chip.label}`}
                  onClick={() => clearFilter(chip.key)}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
            {chips.length > 0 && (
              <Button
                variant="link"
                size="xs"
                onClick={() => {
                  setText('')
                  update({
                    text: '',
                    kind: '',
                    account: '',
                    category: '',
                    pot: '',
                    tag: '',
                    status: '',
                    money: '',
                  })
                }}
              >
                limpar filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {[
          ['Lançamentos', String(totals.count), ''],
          ['Entradas', formatMoney(totals.incomeCents), 'text-emerald-700 dark:text-emerald-400'],
          ['Saídas', formatMoney(totals.expenseCents), 'text-destructive'],
          ['Total', formatMoney(totals.totalCents), ''],
          ['Média por mês', formatMoney(totals.monthlyAverageCents), ''],
        ].map(([label, value, tone]) => (
          <div
            key={label}
            className="bg-card ring-foreground/10 grid gap-0.5 rounded-lg px-3 py-2 ring-1"
          >
            <dt className="text-muted-foreground text-xs tracking-wide uppercase">{label}</dt>
            <dd className={cn('font-mono text-lg tabular-nums', tone)}>{value}</dd>
          </div>
        ))}
      </dl>

      <Card>
        <CardContent>
          {query.group === 'none' ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Pote</TableHead>
                  <TableHead>Repete</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {occurrences.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-muted-foreground py-6 text-center">
                      Nenhum lançamento encontrado.
                    </TableCell>
                  </TableRow>
                )}
                {occurrences.map(({ landing, valueCents }, index) => {
                  const { entry } = landing
                  const label = (id: string | null) => accountLabel(id, data.accounts, data.banks)
                  return (
                    <TableRow
                      key={`${entry.id}-${landing.month}-${landing.part?.id ?? 'whole'}-${index}`}
                      tabIndex={0}
                      data-pot={entry.pot ?? undefined}
                      className={cn('cursor-pointer', potTint(entry.pot))}
                      onClick={() => openEdit(targetFor(data, landing))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') openEdit(targetFor(data, landing))
                      }}
                    >
                      <TableCell className="font-mono">
                        {shortDate(landing.month, landing.day)}
                      </TableCell>
                      <TableCell>
                        {entry.description}
                        {landing.part !== null && (
                          <Badge variant="outline" className="ml-1.5">
                            {landing.part.label}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {entry.kind === 'transfer'
                          ? `${label(entry.accountId)} → ${label(entry.toAccountId)}`
                          : label(entry.accountId)}
                      </TableCell>
                      <TableCell>
                        {data.categories.find((c) => c.id === entry.categoryId)?.name ?? '–'}
                      </TableCell>
                      <TableCell>
                        {entry.pot === null ? (
                          '–'
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className={cn('size-2 rounded-xs', POT_COLORS[entry.pot])}
                              aria-hidden
                            />
                            {POT_LABELS[entry.pot]}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {installmentLabel(landing) ?? RECURRENCE_LABELS[entry.recurrence]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {entry.kind === 'transfer' && !filtered ? (
                          <span className="text-muted-foreground text-xs">interna</span>
                        ) : (
                          <Money cents={valueCents} tone />
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={6}>Total</TableCell>
                  <TableCell className="text-right">
                    <Money cents={totals.totalCents} />
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          ) : (
            <GroupedTable
              groups={groupOccurrences(occurrences, query.group, ctx)}
              group={query.group}
              totals={totals}
              onDrill={(key) => {
                if (query.group === 'none') return
                const next = drillDown(query, query.group, key)
                setText(next.text)
                navigate(next)
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function GroupedTable({
  groups,
  group,
  totals,
  onDrill,
}: {
  groups: ReturnType<typeof groupOccurrences>
  group: GroupKey
  totals: ReturnType<typeof searchTotals>
  onDrill: (key: string) => void
}) {
  const max = Math.max(1, ...groups.map((g) => Math.abs(g.totalCents)))
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{GROUP_LABELS[group]}</TableHead>
          <TableHead className="text-right">Qtde</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead>Proporção</TableHead>
          <TableHead>
            <span className="sr-only">Ações</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-muted-foreground py-6 text-center">
              Nenhum lançamento encontrado.
            </TableCell>
          </TableRow>
        )}
        {groups.map((g) => (
          <TableRow key={`${g.key}-${g.label}`}>
            <TableCell>{group === 'month' ? monthLabel(g.label) : g.label}</TableCell>
            <TableCell className="text-right">{g.count}</TableCell>
            <TableCell className="text-right">
              <Money cents={g.totalCents} tone />
            </TableCell>
            <TableCell>
              <div className="bg-muted h-2 min-w-20 overflow-hidden rounded-full" aria-hidden>
                <div
                  className="bg-primary h-full"
                  style={{ width: `${(Math.abs(g.totalCents) / max) * 100}%` }}
                />
              </div>
            </TableCell>
            <TableCell>
              <Button variant="link" size="xs" onClick={() => onDrill(g.key)}>
                ver lançamentos
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell>Total</TableCell>
          <TableCell className="text-right">{totals.count}</TableCell>
          <TableCell className="text-right">
            <Money cents={totals.totalCents} />
          </TableCell>
          <TableCell colSpan={2} />
        </TableRow>
      </TableFooter>
    </Table>
  )
}
