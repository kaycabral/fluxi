import { isoDate } from './format'
import { addMonths, type Month } from './month'
import {
  dailyBalance,
  effectOn,
  type Balances,
  type MonthResult,
  type MonthTotals,
} from './projection'
import type { Account, Bank } from './types'

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

/** Each account's balance at the end of `day` of `result`'s month (what lands up to it counts). */
export function accountBalancesOn(result: MonthResult, day: number): Balances {
  const balances: Record<string, number> = { ...result.openingBalances }
  for (const landing of result.landings) {
    if (landing.day > day) continue
    for (const id of [landing.entry.accountId, landing.entry.toAccountId]) {
      // Archived accounts are not in the balances and stay out.
      const current = id === null ? undefined : balances[id]
      if (id !== null && current !== undefined) balances[id] = current + effectOn(landing, id)
    }
  }
  return balances
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
      byBudgetGroup: {},
      unallocatedCents: 0,
    }
  )
}

export type BankBalance = { bankId: string; name: string; cents: number }

/**
 * Today's balance per bank (none when the current month was not projected): the accounts that count in the balance (the
 * projected, non-archived ones) summed by bank, highest first (ties: name).
 */
export function bankBalancesOn(
  results: readonly MonthResult[],
  today: string,
  accounts: readonly Pick<Account, 'id' | 'bankId'>[],
  banks: readonly Pick<Bank, 'id' | 'name'>[],
): BankBalance[] {
  const current = results.find((r) => r.month === today.slice(0, 7))
  if (current === undefined) return []
  const byAccount = accountBalancesOn(current, Number(today.slice(8, 10)))
  const byBank = new Map<string, number>()
  for (const account of accounts) {
    const cents = byAccount[account.id]
    if (cents === undefined) continue
    byBank.set(account.bankId, (byBank.get(account.bankId) ?? 0) + cents)
  }
  return [...byBank]
    .map(([bankId, cents]) => ({
      bankId,
      name: banks.find((b) => b.id === bankId)?.name ?? 'Banco',
      cents,
    }))
    .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name, 'pt-BR'))
}
