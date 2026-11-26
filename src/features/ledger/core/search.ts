import { z } from 'zod'
import { accountIdsOf, accountLabel, bankIdOf, entryMatchesAccounts } from './account-filter'
import { accountIdsInBucket, type MoneyBucket } from './bucket'
import { budgetGroupName } from './labels'
import { addMonths, type Month } from './month'
import { installmentCount, type Landing } from './occurrence'
import { paymentFor, type OccurrencePayment } from './payments'
import { effectOn, type MonthResult } from './projection'
import type { Account, Bank, BudgetGroup, BudgetGroupKey, Category, Entry } from './types'

/**
 * "Transações": search over OCCURRENCES (landings), newest first, with a
 * day range and filters. The whole ledger is loaded once and filtered on the
 * client, so searching never hits the database.
 */

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

/** `YYYY-MM-DD`, or `''` for an open end. */
export type IsoDayOrEmpty = string

/** Date order of the list: newest first (default) or oldest first. */
export type SortOrder = 'desc' | 'asc'

export const SORT_LABELS: Record<SortOrder, string> = {
  desc: 'Mais recentes primeiro',
  asc: 'Mais antigos primeiro',
}

export type SearchQuery = {
  text: string
  sort: SortOrder
  /** First day shown (inclusive); `''` = from the ledger's start. */
  from: IsoDayOrEmpty
  /** Last day shown (inclusive); `''` = to the ledger's end. */
  to: IsoDayOrEmpty
  kind: KindFilter
  /** See {@link accountIdsOf}. */
  account: string
  /** Empty, `g:<group name>` or a category id. */
  category: string
  /** Budget group key; `''` = any budget group. */
  budgetGroup: BudgetGroupKey
  tag: string
  status: StatusFilter
  money: MoneyFilter
}

/** No filter at all: every occurrence, from the start to the end of the ledger. */
export const EMPTY_SEARCH_QUERY: SearchQuery = {
  text: '',
  sort: 'desc',
  from: '',
  to: '',
  kind: '',
  account: '',
  category: '',
  budgetGroup: '',
  tag: '',
  status: '',
  money: '',
}

/**
 * The query is remembered per browser in this cookie (written by the client,
 * read by the server so the page renders already filtered). Only filter
 * choices, never sent anywhere else; scoped to the page's path.
 */
export const SEARCH_QUERY_COOKIE = 'fluxi_lancamentos'

const ISO_DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

const searchQuerySchema = z.object({
  text: z.string().max(120).catch(''),
  sort: z.enum(['desc', 'asc']).catch('desc'),
  from: z.union([z.literal(''), z.string().regex(ISO_DAY)]).catch(''),
  to: z.union([z.literal(''), z.string().regex(ISO_DAY)]).catch(''),
  kind: z.enum(['', 'income', 'expense', 'transfer']).catch(''),
  account: z.string().max(80).catch(''),
  category: z.string().max(120).catch(''),
  budgetGroup: z.union([z.literal(''), z.string().regex(/^[a-z0-9_]{1,40}$/)]).catch(''),
  tag: z.string().max(40).catch(''),
  status: z.enum(['', 'paid', 'unpaid']).catch(''),
  money: z.enum(['', 'available', 'benefit']).catch(''),
})

/** The remembered query (cookie value); each bad or missing field falls back to "no filter". */
export function parseSearchQuery(raw: string | undefined): SearchQuery {
  if (raw === undefined || raw === '') return EMPTY_SEARCH_QUERY
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return EMPTY_SEARCH_QUERY
  }
  if (typeof json !== 'object' || json === null) return EMPTY_SEARCH_QUERY
  const query = searchQuerySchema.parse({ ...EMPTY_SEARCH_QUERY, ...json })
  return query.from !== '' && query.to !== '' && query.to < query.from
    ? { ...query, to: query.from }
    : query
}

/** Cookie value for a query (only what differs from "no filter"). */
export function serializeSearchQuery(query: SearchQuery): string {
  const keys = [
    'text',
    'sort',
    'from',
    'to',
    'kind',
    'account',
    'category',
    'budgetGroup',
    'tag',
    'status',
    'money',
  ] as const satisfies readonly (keyof SearchQuery)[]
  return JSON.stringify(
    Object.fromEntries(
      keys.filter((k) => query[k] !== EMPTY_SEARCH_QUERY[k]).map((k) => [k, query[k]]),
    ),
  )
}

/** Last month an entry can land in; null when the series never ends. */
function lastMonthOf(entry: Entry): Month | null {
  // A `nextMonth` part lands one month after its occurrence.
  const after = (month: Month) => addMonths(month, 1)
  switch (entry.recurrence) {
    case 'none':
      return after(entry.startMonth)
    case 'installments':
      return after(addMonths(entry.startMonth, Math.max(installmentCount(entry) - 1, 0)))
    case 'monthly':
    case 'yearly':
      return entry.endMonth === null ? null : after(entry.endMonth)
  }
}

/** Months a never-ending series is shown ahead of today. */
export const OPEN_SERIES_HORIZON_MONTHS = 12

/**
 * Months "from the start to the end": from the first entry to the last month
 * anything lands in; never-ending series stop {@link OPEN_SERIES_HORIZON_MONTHS}
 * after `today`.
 */
export function ledgerSpan(entries: readonly Entry[], today: Month): { from: Month; to: Month } {
  if (entries.length === 0) return { from: today, to: today }
  let from = today
  let to = today
  for (const entry of entries) {
    if (entry.startMonth < from) from = entry.startMonth
    const last = lastMonthOf(entry) ?? addMonths(today, OPEN_SERIES_HORIZON_MONTHS)
    const end = last < entry.startMonth ? entry.startMonth : last
    if (end > to) to = end
  }
  return { from, to }
}

export type SearchContext = {
  accounts: readonly Pick<Account, 'id' | 'bankId' | 'name' | 'type'>[]
  banks: readonly Pick<Bank, 'id' | 'name'>[]
  categories: readonly Pick<Category, 'id' | 'groupName' | 'name'>[]
  /** Names the budget group chip (unknown keys show `–`). */
  budgetGroups?: readonly BudgetGroup[]
  /** Needed by the status filter (none = nothing paid). */
  payments?: readonly OccurrencePayment[]
}

export type Occurrence = {
  landing: Landing
  /** Signed value in the filtered accounts (or the signed amount without an account filter). */
  valueCents: number
}

/** Signed value of a landing: in `ids` when filtered; otherwise its signed amount, transfer 0. */
export function occurrenceValue(landing: Landing, ids: readonly string[] | null): number {
  if (ids !== null) return ids.reduce((sum, id) => sum + effectOn(landing, id), 0)
  return landing.entry.kind === 'transfer' ? 0 : landing.amountCents
}

function categoryOf(categoryId: string | null, ctx: SearchContext) {
  return ctx.categories.find((c) => c.id === categoryId)
}

/** The description or, on a bank entry, the merchant the bank identified. */
function matchesText(entry: Entry, text: string): boolean {
  const needle = text.trim().toLocaleLowerCase('pt-BR')
  if (needle === '') return true
  return [entry.description, entry.merchantName ?? ''].some((value) =>
    value.toLocaleLowerCase('pt-BR').includes(needle),
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
    matchesText(entry, query.text) &&
    (query.kind === '' || entry.kind === query.kind) &&
    entryMatchesAccounts(entry, ids) &&
    matchesCategory(entry.categoryId, query.category, ctx) &&
    (query.budgetGroup === '' || entry.budgetGroup === query.budgetGroup) &&
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

/** `YYYY-MM-DD` the landing moves money on. */
export function landingDay(landing: Pick<Landing, 'month' | 'day'>): string {
  return `${landing.month}-${String(landing.day).padStart(2, '0')}`
}

/**
 * Months to project for a query: the ledger's span, stretched to cover the
 * chosen days (any date, past or future); an open end past the span goes
 * {@link OPEN_SERIES_HORIZON_MONTHS} beyond the start.
 */
export function searchWindow(
  span: { from: Month; to: Month },
  query: Pick<SearchQuery, 'from' | 'to'>,
): { from: Month; to: Month } {
  const fromMonth = query.from.slice(0, 7)
  const toMonth = query.to.slice(0, 7)
  const from = fromMonth !== '' && fromMonth < span.from ? fromMonth : span.from
  const openTo =
    fromMonth !== '' && fromMonth > span.to
      ? addMonths(fromMonth, OPEN_SERIES_HORIZON_MONTHS)
      : span.to
  const to = toMonth !== '' && toMonth > span.to ? toMonth : openTo
  return { from, to }
}

/** Occurrences that match the query in its date order (same-day ones keep the projection's order). */
export function searchOccurrences(
  months: readonly MonthResult[],
  query: SearchQuery,
  ctx: SearchContext,
): Occurrence[] {
  const ids = searchAccountIds(query, ctx.accounts)
  const fromMonth = query.from.slice(0, 7)
  const toMonth = query.to.slice(0, 7)
  return (
    months
      .filter(
        (m) => (fromMonth === '' || m.month >= fromMonth) && (toMonth === '' || m.month <= toMonth),
      )
      .flatMap((m) => m.landings)
      .filter((landing) => {
        const day = landingDay(landing)
        return (query.from === '' || day >= query.from) && (query.to === '' || day <= query.to)
      })
      .filter((landing) => matches(landing, query, ids, ctx))
      .map((landing) => ({ landing, valueCents: occurrenceValue(landing, ids) }))
      // Stable sort: same-day occurrences keep the projection's order.
      .sort((a, b) => {
        const order = landingDay(a.landing).localeCompare(landingDay(b.landing))
        return query.sort === 'asc' ? order : -order
      })
  )
}

export type ActiveFilter = {
  key:
    | 'text'
    | 'sort'
    | 'period'
    | 'kind'
    | 'account'
    | 'category'
    | 'budgetGroup'
    | 'tag'
    | 'status'
    | 'money'
  label: string
}

/** `2026-12-05` → `05/12/26`. */
function dayLabel(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`
}

function periodLabel(from: string, to: string): string {
  if (from !== '' && to !== '')
    return from === to ? dayLabel(from) : `${dayLabel(from)} a ${dayLabel(to)}`
  return from !== '' ? `Desde ${dayLabel(from)}` : `Até ${dayLabel(to)}`
}

/** Chips of the filters in use. */
export function activeFilters(query: SearchQuery, ctx: SearchContext): ActiveFilter[] {
  const out: ActiveFilter[] = []
  if (query.text !== '') out.push({ key: 'text', label: `"${query.text}"` })
  if (query.sort !== 'desc') out.push({ key: 'sort', label: SORT_LABELS[query.sort] })
  if (query.from !== '' || query.to !== '') {
    out.push({ key: 'period', label: periodLabel(query.from, query.to) })
  }
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
  if (query.budgetGroup !== '')
    out.push({
      key: 'budgetGroup',
      label: budgetGroupName(query.budgetGroup, ctx.budgetGroups ?? []),
    })
  if (query.tag !== '') out.push({ key: 'tag', label: `#${query.tag}` })
  if (query.status !== '') out.push({ key: 'status', label: STATUS_LABELS[query.status] })
  if (query.money !== '') out.push({ key: 'money', label: MONEY_LABELS[query.money] })
  return out
}

export type SearchTotals = { incomeCents: number; expenseCents: number; netCents: number }

/** Sum of the listed occurrences: money in, money out (negative) and the net. */
export function searchTotals(occurrences: readonly Occurrence[]): SearchTotals {
  let incomeCents = 0
  let expenseCents = 0
  for (const { valueCents } of occurrences) {
    if (valueCents > 0) incomeCents += valueCents
    else expenseCents += valueCents
  }
  return { incomeCents, expenseCents, netCents: incomeCents + expenseCents }
}

/** First and last day anything lands on within `span`; null for an empty ledger. */
export function landingBounds(
  months: readonly MonthResult[],
  span: { from: Month; to: Month },
): { first: string; last: string } | null {
  let first: string | null = null
  let last: string | null = null
  for (const m of months) {
    if (m.month < span.from || m.month > span.to) continue
    for (const landing of m.landings) {
      const day = landingDay(landing)
      if (first === null || day < first) first = day
      if (last === null || day > last) last = day
    }
  }
  return first === null || last === null ? null : { first, last }
}

/**
 * Bounds of the date pickers: whole years from the first to the last year with
 * an occurrence (no empty years in the year select); this year when empty.
 */
export function pickerRange(
  bounds: { first: string; last: string } | null,
  today: string,
): { min: string; max: string } {
  return {
    min: `${(bounds?.first ?? today).slice(0, 4)}-01-01`,
    max: `${(bounds?.last ?? today).slice(0, 4)}-12-31`,
  }
}
