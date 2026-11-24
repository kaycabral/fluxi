import 'server-only'

import { addMonths, type Month } from '@/features/ledger/core/month'
import type { BudgetPot, PotKey } from '@/features/ledger/core/types'
import type { LedgerData, LedgerRefs } from '@/features/ledger/core/view'
import { readBackend, type BackendRead } from '@/lib/backend-read'
import {
  getCountFrom,
  listAccounts,
  listBanks,
  listBudgetPots,
  listCategories,
  listDescriptions,
  loadLedger,
  type MonthWindow,
} from './ledger.repo'
import { projectLedger } from './projection'

/**
 * Page loaders: what each signed-in page hands its client view, read through
 * `readBackend` so an unavailable database degrades the page ("Tentar de
 * novo") instead of crashing it. All reads are scoped by `userId`.
 */

export function loadRefs(userId: string, today: string): Promise<BackendRead<LedgerRefs>> {
  return readBackend('ledger refs', async () => {
    const [banks, accounts, categories, descriptions] = await Promise.all([
      listBanks(userId),
      listAccounts(userId),
      listCategories(userId),
      listDescriptions(userId),
    ])
    return { banks, accounts, categories, descriptions, today }
  })
}

export function loadCountFrom(userId: string): Promise<BackendRead<Month | null>> {
  return readBackend('count from', () => getCountFrom(userId))
}

/**
 * The ledger over `window`, loaded from `count_from_month` when that is
 * earlier, so the client projection accumulates balances correctly.
 */
export function loadLedgerData(
  userId: string,
  window: MonthWindow,
  countFrom: Month | null,
): Promise<BackendRead<LedgerData>> {
  return readBackend('ledger', async () => {
    const from = countFrom !== null && countFrom < window.from ? countFrom : window.from
    const { pots: _pots, ...data } = await loadLedger(userId, { from, to: window.to })
    return data
  })
}

export type BudgetMonth = { month: Month; incomeCents: number; byPot: Record<PotKey, number> }

export type BudgetData = {
  pots: BudgetPot[]
  months: BudgetMonth[]
}

/** Targets and the 12 counted months from `start` (income and planned expense per pot). */
export function loadBudgetData(userId: string, start: Month): Promise<BackendRead<BudgetData>> {
  return readBackend('budget', async () => {
    const [pots, projection] = await Promise.all([
      listBudgetPots(userId),
      projectLedger(userId, { from: start, to: addMonths(start, 11) }),
    ])
    return {
      pots,
      months: projection.months.map((m) => ({
        month: m.month,
        incomeCents: m.incomeCents,
        byPot: m.byPot,
      })),
    }
  })
}

export type AccountsData = {
  firstMonth: Month
  laterMonth: Month
  /** Balance per account at the end of each month (null before the count start). */
  firstClosing: Record<string, number> | null
  laterClosing: Record<string, number> | null
}

/** Balances at the end of `first` and of `later` for the accounts page. */
export function loadAccountBalances(
  userId: string,
  first: Month,
  later: Month,
): Promise<BackendRead<AccountsData>> {
  return readBackend('account balances', async () => {
    const { months } = await projectLedger(userId, { from: first, to: later })
    return {
      firstMonth: first,
      laterMonth: later,
      firstClosing: months.at(0)?.closingBalances ?? null,
      laterClosing: months.at(-1)?.closingBalances ?? null,
    }
  })
}
