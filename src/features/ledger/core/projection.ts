import type { Month } from './month'
import { landingsIn, type Landing } from './occurrence'
import type { Account, Entry, EntryOverride, EntryPart } from './types'

export type Balances = Record<string, number>

/** Month totals over every account (benefit accounts included). */
export type MonthTotals = {
  incomeCents: number
  expenseCents: number
  /** Income minus expenses; transfers only move money between accounts. */
  netCents: number
  /** Expense entries per pot key (transfers never consume a pot). */
  byPot: Record<string, number>
  /** Expense entries without a pot. */
  unallocatedCents: number
}

export type MonthResult = {
  month: Month
  /** False before `countFrom`: totals are still computed, balances are not. */
  counted: boolean
  /** Ordered by day, income first within a day, then input order. */
  landings: Landing[]
  totals: MonthTotals
  openingBalances: Balances | null
  closingBalances: Balances | null
}

export type ProjectionInput = {
  entries: readonly Entry[]
  parts: readonly EntryPart[]
  overrides: readonly EntryOverride[]
  accounts: readonly Pick<Account, 'id' | 'openingBalanceCents'>[]
  /**
   * Months to project. Balances accumulate from `countFrom` (or the first
   * month when null) in ascending order, so for correct balances the range
   * must start at or before `countFrom` and be contiguous.
   */
  months: readonly Month[]
  countFrom: Month | null
}

const kindOrder = (landing: Landing) => (landing.entry.kind === 'income' ? 0 : 1)

function orderLandings(landings: Landing[]): Landing[] {
  return landings
    .map((landing, index) => ({ landing, index }))
    .sort(
      (a, b) =>
        a.landing.day - b.landing.day ||
        kindOrder(a.landing) - kindOrder(b.landing) ||
        a.index - b.index,
    )
    .map(({ landing }) => landing)
}

/** Signed effect of a landing on one account. */
export function effectOn(landing: Landing, accountId: string): number {
  const { entry, amountCents } = landing
  if (entry.kind === 'transfer') {
    return (
      (entry.toAccountId === accountId ? amountCents : 0) -
      (entry.accountId === accountId ? amountCents : 0)
    )
  }
  if (entry.accountId !== accountId) return 0
  return entry.kind === 'income' ? amountCents : -amountCents
}

function totalsOf(landings: readonly Landing[]): MonthTotals {
  const totals: MonthTotals = {
    incomeCents: 0,
    expenseCents: 0,
    netCents: 0,
    byPot: {},
    unallocatedCents: 0,
  }
  for (const { entry, amountCents } of landings) {
    if (entry.kind === 'income') totals.incomeCents += amountCents
    else if (entry.kind === 'expense') {
      totals.expenseCents += amountCents
      if (entry.pot === null) totals.unallocatedCents += amountCents
      else totals.byPot[entry.pot] = (totals.byPot[entry.pot] ?? 0) + amountCents
    }
  }
  totals.netCents = totals.incomeCents - totals.expenseCents
  return totals
}

function applyToBalances(balances: Map<string, number>, landings: readonly Landing[]): void {
  const move = (accountId: string, cents: number) =>
    balances.set(accountId, (balances.get(accountId) ?? 0) + cents)
  for (const landing of landings) {
    const { entry } = landing
    move(entry.accountId, effectOn(landing, entry.accountId))
    if (entry.toAccountId !== null) move(entry.toAccountId, effectOn(landing, entry.toAccountId))
  }
}

/** Month-by-month totals and per-account balances. */
export function projectMonths(input: ProjectionInput): MonthResult[] {
  const balances = new Map(input.accounts.map((a) => [a.id, a.openingBalanceCents]))
  const snapshot = (): Balances => Object.fromEntries(balances)

  return [...input.months].sort().map((month) => {
    const counted = input.countFrom === null || month >= input.countFrom
    const landings = orderLandings(
      input.entries.flatMap((entry) => landingsIn(entry, input.parts, input.overrides, month)),
    )
    const openingBalances = counted ? snapshot() : null
    if (counted) applyToBalances(balances, landings)
    return {
      month,
      counted,
      landings,
      totals: totalsOf(landings),
      openingBalances,
      closingBalances: counted ? snapshot() : null,
    }
  })
}

export type DailyRow = {
  landing: Landing
  effectCents: number
  balanceAfterCents: number
}

export type DailyBalance = {
  rows: DailyRow[]
  openingCents: number
  closingCents: number
  minBalanceCents: number
  /** Day the minimum is first reached (1 when it is the opening balance). */
  minDay: number
}

/**
 * Day-by-day running balance of a set of accounts (all accounts when
 * `accountIds` is null) within a counted month; null for an uncounted month.
 */
export function dailyBalance(
  result: MonthResult,
  accountIds: readonly string[] | null,
): DailyBalance | null {
  const opening = result.openingBalances
  if (opening === null) return null
  const ids = accountIds ?? Object.keys(opening)
  const touches = (landing: Landing) =>
    ids.includes(landing.entry.accountId) ||
    (landing.entry.toAccountId !== null && ids.includes(landing.entry.toAccountId))

  const openingCents = ids.reduce((sum, id) => sum + (opening[id] ?? 0), 0)
  let running = openingCents
  let minBalanceCents = openingCents
  let minDay = 1
  const rows: DailyRow[] = []
  for (const landing of result.landings) {
    if (!touches(landing)) continue
    const effectCents = ids.reduce((sum, id) => sum + effectOn(landing, id), 0)
    running += effectCents
    rows.push({ landing, effectCents, balanceAfterCents: running })
    if (running < minBalanceCents) {
      minBalanceCents = running
      minDay = landing.day
    }
  }
  return { rows, openingCents, closingCents: running, minBalanceCents, minDay }
}
