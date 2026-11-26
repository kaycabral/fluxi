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
 * (today to the end of next month). Null when the current month was not
 * projected.
 */
export function balanceSnapshot(
  results: readonly MonthResult[],
  today: string,
): BalanceSnapshot | null {
  const month = today.slice(0, 7)
  const day = Number(today.slice(8, 10))
  const current = results.find((r) => r.month === month)
  if (current === undefined) return null
  const currentDaily = dailyBalance(current, null)

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
  if (next !== undefined) {
    for (const row of dailyBalance(next, null).rows) {
      consider(row.balanceAfterCents, isoDate(next.month, row.landing.day))
    }
  }

  return { todayCents, monthEndCents: currentDaily.closingCents, lowestCents, lowestDate }
}

export type MonthBalance = { month: Month; closingCents: number }

/** Month-end balance over every account, per month. */
export function monthEndBalances(results: readonly MonthResult[]): MonthBalance[] {
  return results.map((r) => ({
    month: r.month,
    closingCents: Object.values(r.closingBalances).reduce((sum, cents) => sum + cents, 0),
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
