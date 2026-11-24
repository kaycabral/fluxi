import { bucketOfAccount, type MoneyBucket } from './bucket'
import type { Month } from './month'
import { landingsIn, type Landing } from './occurrence'
import type { Account, Entry, EntryOverride, EntryPart, PotKey } from './types'

export type Balances = Record<string, number>

/** Month totals of one money bucket (see {@link MoneyBucket}). */
export type BucketTotals = {
  /** Income into the bucket plus transfers coming from the other bucket. */
  incomeCents: number
  /**
   * Expenses paid from the bucket plus transfers going to the other bucket
   * (a transfer within the bucket moves money between accounts, not out of it).
   */
  expenseCents: number
  netCents: number
  /** Expense entries only (transfers never consume a pot). */
  byPot: Record<PotKey, number>
  /** Expense entries without a pot. */
  unallocatedCents: number
}

export type MonthResult = {
  month: Month
  /** False before `countFrom`: totals are still computed, balances are not. */
  counted: boolean
  /** Ordered by day, income first within a day, then input order. */
  landings: Landing[]
  /**
   * Totals per bucket. Decision views read `available`; benefits are never
   * mixed into it.
   */
  byBucket: Record<MoneyBucket, BucketTotals>
  openingBalances: Balances | null
  closingBalances: Balances | null
}

export type ProjectionInput = {
  entries: readonly Entry[]
  parts: readonly EntryPart[]
  overrides: readonly EntryOverride[]
  /** The type decides the bucket of each account. */
  accounts: readonly Pick<Account, 'id' | 'openingBalanceCents' | 'type'>[]
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

function emptyByPot(): Record<PotKey, number> {
  return {
    essential: 0,
    comfort: 0,
    guilt_free: 0,
    education: 0,
    variable: 0,
    investment: 0,
  }
}

function emptyTotals(): BucketTotals {
  return { incomeCents: 0, expenseCents: 0, netCents: 0, byPot: emptyByPot(), unallocatedCents: 0 }
}

function totalsOf(
  landings: readonly Landing[],
  accounts: ProjectionInput['accounts'],
): Record<MoneyBucket, BucketTotals> {
  const byBucket = { available: emptyTotals(), benefit: emptyTotals() }
  for (const { entry, amountCents } of landings) {
    const from = byBucket[bucketOfAccount(entry.accountId, accounts)]
    if (entry.kind === 'income') from.incomeCents += amountCents
    else if (entry.kind === 'expense') {
      from.expenseCents += amountCents
      if (entry.pot === null) from.unallocatedCents += amountCents
      else from.byPot[entry.pot] += amountCents
    } else if (entry.toAccountId !== null) {
      const to = byBucket[bucketOfAccount(entry.toAccountId, accounts)]
      if (to !== from) {
        from.expenseCents += amountCents
        to.incomeCents += amountCents
      }
    }
  }
  for (const totals of Object.values(byBucket)) {
    totals.netCents = totals.incomeCents - totals.expenseCents
  }
  return byBucket
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
      byBucket: totalsOf(landings, input.accounts),
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
