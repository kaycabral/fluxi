import { isoDate } from './format'
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
  /** Expense entries per budget group key (transfers never consume a budget group). */
  byBudgetGroup: Record<string, number>
  /** Expense entries without a budget group. */
  unallocatedCents: number
}

export type MonthResult = {
  month: Month
  /** Ordered by day, inflows first within a day, then input order. */
  landings: Landing[]
  totals: MonthTotals
  openingBalances: Balances
  closingBalances: Balances
}

export type ProjectionInput = {
  entries: readonly Entry[]
  parts: readonly EntryPart[]
  overrides: readonly EntryOverride[]
  /**
   * Archived accounts have no influence at all (see {@link archivedFilter}).
   * `archived` omitted = active.
   */
  accounts: readonly (Pick<Account, 'id' | 'openingBalanceCents'> &
    Partial<Pick<Account, 'archived'>>)[]
  /**
   * Months to project. Balances accumulate from each account's opening balance
   * in ascending order, so for correct balances the range must be contiguous
   * and start at or before the first month any entry lands in
   * ({@link firstLandingMonth}).
   */
  months: readonly Month[]
  /** Bank-fed accounts (see {@link FeedRule}); none when omitted. */
  feed?: FeedRule
}

/**
 * Accounts with a mapped bank feed: their past is the bank's. A PLANNED
 * occurrence (an entry without a bank link) landing up to `today` that touches
 * a connected account does not exist for the projection (balances, totals,
 * calendar, "A pagar"); the bank's own entries count as usual, and planned
 * occurrences after `today` count. Accounts without a feed are unchanged. A
 * planned transfer between a connected and an unconnected account is dropped
 * whole (keep it simple: the bank already shows its side).
 */
export type FeedRule = {
  connectedAccountIds: readonly string[]
  /** `YYYY-MM-DD`. */
  today: string
}

/** The test of {@link FeedRule}: whether a landing counts (ids indexed once). */
export function feedFilter(rule: FeedRule | undefined): (landing: Landing) => boolean {
  if (rule === undefined || rule.connectedAccountIds.length === 0) return () => true
  const connected = new Set(rule.connectedAccountIds)
  return ({ entry, month, day }) =>
    entry.fromBank ||
    !(
      connected.has(entry.accountId) ||
      (entry.toAccountId !== null && connected.has(entry.toAccountId))
    ) ||
    isoDate(month, day) > rule.today
}

/**
 * Archived accounts are out of every view, for all time, until unarchived (a
 * view rule; nothing is deleted): their opening balance and balance are not
 * projected and an entry counts only while it touches an active account. A
 * transfer between an active and an archived account keeps only the active
 * side (its balance moves; transfers are never income or expense anyway).
 * Returns whether an entry touches an active account.
 */
export function archivedFilter(
  accounts: readonly Partial<Pick<Account, 'id' | 'archived'>>[],
): (entry: Pick<Entry, 'accountId' | 'toAccountId'>) => boolean {
  const archived = new Set(accounts.filter((a) => a.archived === true).map((a) => a.id))
  if (archived.size === 0) return () => true
  return ({ accountId, toAccountId }) =>
    !archived.has(accountId) || (toAccountId !== null && !archived.has(toAccountId))
}

/** Inflows (positive amounts) before outflows on the same day. */
const kindOrder = (landing: Landing) => (landing.amountCents > 0 ? 0 : 1)

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

/**
 * Signed effect of a landing on one account. Amounts are signed from the
 * source account's point of view (negative = money leaves it); a transfer's
 * destination gets the opposite.
 */
export function effectOn(landing: Landing, accountId: string): number {
  const { entry, amountCents } = landing
  if (entry.kind === 'transfer') {
    return (
      (entry.accountId === accountId ? amountCents : 0) -
      (entry.toAccountId === accountId ? amountCents : 0)
    )
  }
  return entry.accountId === accountId ? amountCents : 0
}

/**
 * Totals in magnitudes: income is the signed sum of income amounts (reversals
 * reduce it), expenses the negated sum of expense amounts (refunds reduce it
 * and may take a budget group below zero; consumers clamp only when displaying).
 */
function totalsOf(landings: readonly Landing[]): MonthTotals {
  const totals: MonthTotals = {
    incomeCents: 0,
    expenseCents: 0,
    netCents: 0,
    byBudgetGroup: {},
    unallocatedCents: 0,
  }
  for (const { entry, amountCents } of landings) {
    if (entry.kind === 'income') totals.incomeCents += amountCents
    else if (entry.kind === 'expense') {
      const spent = -amountCents
      totals.expenseCents += spent
      if (entry.budgetGroup === null) totals.unallocatedCents += spent
      else
        totals.byBudgetGroup[entry.budgetGroup] =
          (totals.byBudgetGroup[entry.budgetGroup] ?? 0) + spent
    }
  }
  totals.netCents = totals.incomeCents - totals.expenseCents
  return totals
}

/** Moves every account but the `archived` ones (unknown accounts start at zero). */
function applyToBalances(
  balances: Map<string, number>,
  landings: readonly Landing[],
  archived: ReadonlySet<string>,
): void {
  const move = (accountId: string, cents: number) => {
    if (!archived.has(accountId)) balances.set(accountId, (balances.get(accountId) ?? 0) + cents)
  }
  for (const landing of landings) {
    const { entry } = landing
    move(entry.accountId, effectOn(landing, entry.accountId))
    if (entry.toAccountId !== null) move(entry.toAccountId, effectOn(landing, entry.toAccountId))
  }
}

/**
 * First month anything of `entries` can land in (a series' start month), or
 * null without entries: the projection must start there for balances that
 * accumulate over every entry.
 */
export function firstLandingMonth(entries: readonly Pick<Entry, 'startMonth'>[]): Month | null {
  let first: Month | null = null
  for (const { startMonth } of entries) if (first === null || startMonth < first) first = startMonth
  return first
}

/** Month-by-month totals and per-account balances. */
export function projectMonths(input: ProjectionInput): MonthResult[] {
  const archived = new Set(input.accounts.filter((a) => a.archived === true).map((a) => a.id))
  const balances = new Map(
    input.accounts.filter((a) => !archived.has(a.id)).map((a) => [a.id, a.openingBalanceCents]),
  )
  const snapshot = (): Balances => Object.fromEntries(balances)
  const counts = feedFilter(input.feed)
  const active = archivedFilter(input.accounts)

  return [...input.months].sort().map((month) => {
    const landings = orderLandings(
      input.entries
        .filter(active)
        .flatMap((entry) => landingsIn(entry, input.parts, input.overrides, month))
        .filter(counts),
    )
    const openingBalances = snapshot()
    applyToBalances(balances, landings, archived)
    return {
      month,
      landings,
      totals: totalsOf(landings),
      openingBalances,
      closingBalances: snapshot(),
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
 * `accountIds` is null) within a month.
 */
export function dailyBalance(
  result: MonthResult,
  accountIds: readonly string[] | null,
): DailyBalance {
  const opening = result.openingBalances
  // Accounts missing from the balances (archived) never count.
  const ids = (accountIds ?? Object.keys(opening)).filter((id) => id in opening)
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
