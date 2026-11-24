import { z } from 'zod'
import {
  accountIdsOf,
  accountLabel,
  bankFilter,
  bankIdOf,
  entryMatchesAccounts,
} from './account-filter'
import { accountIdsInBucket, type MoneyBucket } from './bucket'
import { POT_LABELS } from './labels'
import { addMonths, diffMonths, type Month } from './month'
import type { Landing } from './occurrence'
import { paymentFor, type OccurrencePayment } from './payments'
import { effectOn, type MonthResult } from './projection'
import { POT_KEYS, type Account, type Bank, type Category, type PotKey } from './types'

/**
 * "Lançamentos": search over OCCURRENCES (landings) of a month range, with
 * totals and grouping. The query lives in the URL, so a view is shareable.
 */

export const GROUP_KEYS = [
  'month',
  'year',
  'group',
  'category',
  'account',
  'bank',
  'pot',
  'description',
] as const
export type GroupKey = (typeof GROUP_KEYS)[number]

export const GROUP_LABELS: Record<GroupKey | 'none', string> = {
  none: 'Não agrupar',
  month: 'Mês',
  year: 'Ano',
  group: 'Grupo de categoria',
  category: 'Categoria',
  account: 'Conta',
  bank: 'Banco',
  pot: 'Pote',
  description: 'Descrição',
}

export type KindFilter = '' | 'income' | 'expense' | 'transfer'

/** "Pago/recebido" filter: every occurrence, only paid ones or only unpaid ones. */
export type StatusFilter = '' | 'paid' | 'unpaid'

export const STATUS_LABELS: Record<Exclude<StatusFilter, ''>, string> = {
  paid: 'Pagos',
  unpaid: 'Não pagos',
}

/** "Dinheiro" filter: every account, only available money or only benefits. */
export type MoneyFilter = '' | MoneyBucket

export const MONEY_LABELS: Record<Exclude<MoneyFilter, ''>, string> = {
  available: 'Disponível',
  benefit: 'Benefícios',
}

export type SearchQuery = {
  text: string
  from: Month
  to: Month
  kind: KindFilter
  /** See {@link accountIdsOf}. */
  account: string
  /** Empty, `g:<group name>` or a category id. */
  category: string
  pot: PotKey | ''
  tag: string
  status: StatusFilter
  money: MoneyFilter
  group: GroupKey | 'none'
}

/** Defaults: 12 months from `start`, grouped by month. */
export function defaultSearchQuery(start: Month): SearchQuery {
  return {
    text: '',
    from: start,
    to: addMonths(start, 11),
    kind: '',
    account: '',
    category: '',
    pot: '',
    tag: '',
    status: '',
    money: '',
    group: 'month',
  }
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const PARAM_NAMES: Record<keyof SearchQuery, string> = {
  text: 'q',
  from: 'de',
  to: 'ate',
  kind: 'tipo',
  account: 'conta',
  category: 'categoria',
  pot: 'pote',
  tag: 'tag',
  status: 'status',
  money: 'dinheiro',
  group: 'agrupar',
}

const QUERY_KEYS: readonly (keyof SearchQuery)[] = [
  'text',
  'from',
  'to',
  'kind',
  'account',
  'category',
  'pot',
  'tag',
  'status',
  'money',
  'group',
]

const paramsSchema = z.object({
  text: z.string().max(120).catch(''),
  from: z.string().regex(MONTH).optional().catch(undefined),
  to: z.string().regex(MONTH).optional().catch(undefined),
  kind: z.enum(['', 'income', 'expense', 'transfer']).catch(''),
  account: z.string().max(80).catch(''),
  category: z.string().max(120).catch(''),
  pot: z.enum(['', ...POT_KEYS]).catch(''),
  tag: z.string().max(40).catch(''),
  status: z.enum(['', 'paid', 'unpaid']).catch(''),
  money: z.enum(['', 'available', 'benefit']).catch(''),
  group: z
    .enum(['none', ...GROUP_KEYS])
    .optional()
    .catch(undefined),
})

type RawParams = Record<string, string | string[] | undefined>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/** URL search params → query (invalid values fall back to the defaults). */
export function parseSearchQuery(params: RawParams, start: Month): SearchQuery {
  const defaults = defaultSearchQuery(start)
  const parsed = paramsSchema.parse({
    text: first(params[PARAM_NAMES.text]) ?? '',
    from: first(params[PARAM_NAMES.from]),
    to: first(params[PARAM_NAMES.to]),
    kind: first(params[PARAM_NAMES.kind]) ?? '',
    account: first(params[PARAM_NAMES.account]) ?? '',
    category: first(params[PARAM_NAMES.category]) ?? '',
    pot: first(params[PARAM_NAMES.pot]) ?? '',
    tag: first(params[PARAM_NAMES.tag]) ?? '',
    status: first(params[PARAM_NAMES.status]) ?? '',
    money: first(params[PARAM_NAMES.money]) ?? '',
    group: first(params[PARAM_NAMES.group]),
  })
  const from = parsed.from ?? defaults.from
  const to = parsed.to ?? (parsed.from === undefined ? defaults.to : addMonths(from, 11))
  return {
    ...parsed,
    from,
    to: to < from ? from : to,
    group: parsed.group ?? defaults.group,
  }
}

/** Query → URL search string (only what differs from the defaults). */
export function searchQueryToParams(query: SearchQuery, start: Month): string {
  const defaults = defaultSearchQuery(start)
  const params = new URLSearchParams()
  for (const key of QUERY_KEYS) {
    const value = query[key]
    if (key === 'from' || key === 'to') {
      if (query.from !== defaults.from || query.to !== defaults.to)
        params.set(PARAM_NAMES[key], value)
    } else if (value !== defaults[key]) {
      params.set(PARAM_NAMES[key], value)
    }
  }
  return params.toString()
}

export type SearchContext = {
  accounts: readonly Pick<Account, 'id' | 'bankId' | 'name' | 'type'>[]
  banks: readonly Pick<Bank, 'id' | 'name'>[]
  categories: readonly Pick<Category, 'id' | 'groupName' | 'name'>[]
  /** Needed by the status filter (none = nothing paid). */
  payments?: readonly OccurrencePayment[]
}

export type Occurrence = {
  landing: Landing
  /** Signed value in the filtered accounts (or income/expense sign without an account filter). */
  valueCents: number
}

/** Signed value of a landing: in `ids` when filtered; otherwise income +, expense −, transfer 0. */
export function occurrenceValue(landing: Landing, ids: readonly string[] | null): number {
  if (ids !== null) return ids.reduce((sum, id) => sum + effectOn(landing, id), 0)
  const { kind } = landing.entry
  if (kind === 'transfer') return 0
  return kind === 'income' ? landing.amountCents : -landing.amountCents
}

function categoryOf(categoryId: string | null, ctx: SearchContext) {
  return ctx.categories.find((c) => c.id === categoryId)
}

function matchesText(description: string, text: string): boolean {
  return (
    text === '' || description.toLocaleLowerCase('pt-BR').includes(text.toLocaleLowerCase('pt-BR'))
  )
}

function matchesCategory(categoryId: string | null, filter: string, ctx: SearchContext): boolean {
  if (filter === '') return true
  if (filter.startsWith('g:')) return categoryOf(categoryId, ctx)?.groupName === filter.slice(2)
  return categoryId === filter
}

function matches(
  landing: Landing,
  query: SearchQuery,
  ids: string[] | null,
  ctx: SearchContext,
): boolean {
  const { entry } = landing
  return (
    matchesText(entry.description, query.text) &&
    (query.kind === '' || entry.kind === query.kind) &&
    entryMatchesAccounts(entry, ids) &&
    matchesCategory(entry.categoryId, query.category, ctx) &&
    (query.pot === '' || entry.pot === query.pot) &&
    (query.tag === '' || entry.tags.includes(query.tag)) &&
    matchesStatus(landing, query.status, ctx)
  )
}

function matchesStatus(landing: Landing, status: StatusFilter, ctx: SearchContext): boolean {
  if (status === '') return true
  const paid = paymentFor(landing, ctx.payments ?? []) !== undefined
  return status === 'paid' ? paid : !paid
}

/**
 * Accounts the query covers: the account filter narrowed to the "Dinheiro"
 * bucket; null = no restriction at all.
 */
export function searchAccountIds(
  query: Pick<SearchQuery, 'account' | 'money'>,
  accounts: SearchContext['accounts'],
): string[] | null {
  const ids = accountIdsOf(query.account, accounts)
  if (query.money === '') return ids
  const inBucket = accountIdsInBucket(accounts, query.money)
  return ids === null ? inBucket : ids.filter((id) => inBucket.includes(id))
}

/** Occurrences of the query's months that match its filters, in date order. */
export function searchOccurrences(
  months: readonly MonthResult[],
  query: SearchQuery,
  ctx: SearchContext,
): Occurrence[] {
  const ids = searchAccountIds(query, ctx.accounts)
  return months
    .filter((m) => m.month >= query.from && m.month <= query.to)
    .flatMap((m) => m.landings)
    .filter((landing) => matches(landing, query, ids, ctx))
    .map((landing) => ({ landing, valueCents: occurrenceValue(landing, ids) }))
}

export type SearchTotals = {
  count: number
  incomeCents: number
  expenseCents: number
  totalCents: number
  monthlyAverageCents: number
}

export function searchTotals(occurrences: readonly Occurrence[], query: SearchQuery): SearchTotals {
  let incomeCents = 0
  let expenseCents = 0
  for (const { valueCents } of occurrences) {
    if (valueCents > 0) incomeCents += valueCents
    else expenseCents += valueCents
  }
  const totalCents = incomeCents + expenseCents
  const months = diffMonths(query.from, query.to) + 1
  return {
    count: occurrences.length,
    incomeCents,
    expenseCents,
    totalCents,
    monthlyAverageCents: Math.round(totalCents / months),
  }
}

export type SearchGroup = {
  /** Value the drill-down filters by (a month, a year, an id, a name). */
  key: string
  label: string
  count: number
  totalCents: number
}

function groupKeyOf(
  occurrence: Occurrence,
  group: GroupKey,
  ctx: SearchContext,
): { key: string; label: string } {
  const { entry, month } = occurrence.landing
  const category = categoryOf(entry.categoryId, ctx)
  switch (group) {
    case 'month':
      return { key: month, label: month }
    case 'year':
      return { key: month.slice(0, 4), label: month.slice(0, 4) }
    case 'group': {
      const label =
        entry.kind === 'transfer' ? 'Transferências' : (category?.groupName ?? 'Sem categoria')
      return { key: category?.groupName ?? '', label }
    }
    case 'category': {
      const label =
        entry.kind === 'transfer' ? 'Transferência' : (category?.name ?? 'Sem categoria')
      return { key: category?.id ?? '', label }
    }
    case 'account':
      return { key: entry.accountId, label: accountLabel(entry.accountId, ctx.accounts, ctx.banks) }
    case 'bank': {
      const bankId = ctx.accounts.find((a) => a.id === entry.accountId)?.bankId ?? ''
      return { key: bankId, label: ctx.banks.find((b) => b.id === bankId)?.name ?? '–' }
    }
    case 'pot':
      return {
        key: entry.pot ?? '',
        label: entry.pot === null ? 'Sem pote' : POT_LABELS[entry.pot],
      }
    case 'description':
      return { key: entry.description, label: entry.description }
  }
}

/** Groups with count and total; chronological for month/year, by |total| otherwise. */
export function groupOccurrences(
  occurrences: readonly Occurrence[],
  group: GroupKey,
  ctx: SearchContext,
): SearchGroup[] {
  const groups = new Map<string, SearchGroup>()
  for (const occurrence of occurrences) {
    const { key, label } = groupKeyOf(occurrence, group, ctx)
    const id = `${key}\u0000${label}`
    const current = groups.get(id) ?? { key, label, count: 0, totalCents: 0 }
    current.count += 1
    current.totalCents += occurrence.valueCents
    groups.set(id, current)
  }
  const list = [...groups.values()]
  if (group === 'month' || group === 'year') return list.sort((a, b) => a.key.localeCompare(b.key))
  return list.sort((a, b) => Math.abs(b.totalCents) - Math.abs(a.totalCents))
}

/** "ver lançamentos": narrow the query to one group and stop grouping. */
export function drillDown(query: SearchQuery, group: GroupKey, key: string): SearchQuery {
  const next: SearchQuery = { ...query, group: 'none' }
  switch (group) {
    case 'month':
      return { ...next, from: key, to: key }
    case 'year': {
      const from = `${key}-01` < query.from ? query.from : `${key}-01`
      const to = `${key}-12` > query.to ? query.to : `${key}-12`
      return { ...next, from, to }
    }
    case 'group':
      return { ...next, category: key === '' ? '' : `g:${key}` }
    case 'category':
      return { ...next, category: key }
    case 'account':
      return { ...next, account: key }
    case 'bank':
      return { ...next, account: key === '' ? '' : bankFilter(key) }
    case 'pot':
      return { ...next, pot: potOrEmpty(key) }
    case 'description':
      return { ...next, text: key }
  }
}

function potOrEmpty(value: string): PotKey | '' {
  return POT_KEYS.find((k) => k === value) ?? ''
}

export type ActiveFilter = {
  key: 'text' | 'kind' | 'account' | 'category' | 'pot' | 'tag' | 'status' | 'money'
  label: string
}

/** Chips of the filters in use (period aside). */
export function activeFilters(query: SearchQuery, ctx: SearchContext): ActiveFilter[] {
  const out: ActiveFilter[] = []
  if (query.text !== '') out.push({ key: 'text', label: `"${query.text}"` })
  if (query.kind !== '') {
    out.push({
      key: 'kind',
      label: { income: 'Entradas', expense: 'Saídas', transfer: 'Transferências' }[query.kind],
    })
  }
  if (query.account !== '') {
    const bankId = bankIdOf(query.account)
    out.push({
      key: 'account',
      label:
        bankId === null
          ? accountLabel(query.account, ctx.accounts, ctx.banks)
          : (ctx.banks.find((b) => b.id === bankId)?.name ?? '–'),
    })
  }
  if (query.category !== '') {
    out.push({
      key: 'category',
      label: query.category.startsWith('g:')
        ? query.category.slice(2)
        : (categoryOf(query.category, ctx)?.name ?? '–'),
    })
  }
  if (query.pot !== '') out.push({ key: 'pot', label: POT_LABELS[query.pot] })
  if (query.tag !== '') out.push({ key: 'tag', label: `#${query.tag}` })
  if (query.status !== '') out.push({ key: 'status', label: STATUS_LABELS[query.status] })
  if (query.money !== '') out.push({ key: 'money', label: MONEY_LABELS[query.money] })
  return out
}
