import { isoDate } from './format'
import { addMonths, type Month } from './month'
import { dailyBalance, type MonthResult, type MonthTotals } from './projection'

/** Numbers of the "Painel" cards, over every account. */

export type BalanceSnapshot = {
  /** After everything that lands up to and including today. */
  todayCents: number
  /** Projected at the end of the current month. */
  monthEndCents: number
  /** Lowest projected balance from today to the end of the next month, and its first day. */
  lowestCents: number
  lowestDate: string
}

/**
 * Today's balance, the month-end projection and the lowest balance ahead
 * (today to the end of next month). Null when the current month is not
 * counted (before `count_from_month`), since balances do not exist there.
 */
export function balanceSnapshot(
  results: readonly MonthResult[],
  today: string,
): BalanceSnapshot | null {
  const month = today.slice(0, 7)
  const day = Number(today.slice(8, 10))
  const current = results.find((r) => r.month === month)
  const currentDaily = current === undefined ? null : dailyBalance(current, null)
  if (current === undefined || currentDaily === null) return null

  let todayCents = currentDaily.openingCents
  for (const row of currentDaily.rows) {
    if (row.landing.day <= day) todayCents = row.balanceAfterCents
  }

  let lowestCents = todayCents
  let lowestDate = today
  const consider = (cents: number, date: string) => {
    if (cents < lowestCents) {
      lowestCents = cents
      lowestDate = date
    }
  }
  for (const row of currentDaily.rows) {
    if (row.landing.day > day) consider(row.balanceAfterCents, isoDate(month, row.landing.day))
  }
  const next = results.find((r) => r.month === addMonths(month, 1))
  const nextDaily = next === undefined ? null : dailyBalance(next, null)
  if (next !== undefined && nextDaily !== null) {
    for (const row of nextDaily.rows) {
      consider(row.balanceAfterCents, isoDate(next.month, row.landing.day))
    }
  }

  return { todayCents, monthEndCents: currentDaily.closingCents, lowestCents, lowestDate }
}

export type MonthBalance = { month: Month; closingCents: number | null }

/** Month-end balance over every account, per month (null for an uncounted month). */
export function monthEndBalances(results: readonly MonthResult[]): MonthBalance[] {
  return results.map((r) => ({
    month: r.month,
    closingCents:
      r.closingBalances === null
        ? null
        : Object.values(r.closingBalances).reduce((sum, cents) => sum + cents, 0),
  }))
}

/** Totals of `month` (zeros when it was not projected). */
export function monthTotalsOf(results: readonly MonthResult[], month: Month): MonthTotals {
  return (
    results.find((r) => r.month === month)?.totals ?? {
      incomeCents: 0,
      expenseCents: 0,
      netCents: 0,
      byPot: {},
      unallocatedCents: 0,
    }
  )
}
