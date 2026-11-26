import 'server-only'

import type { Month } from '@/features/ledger/core/month'
import type { BudgetPlan } from '@/features/ledger/core/types'
import type { LedgerData, LedgerRefs } from '@/features/ledger/core/view'
import { readBackend, type BackendRead } from '@/lib/backend-read'
import {
  getCountFrom,
  listAccounts,
  listBanks,
  listBudgetPlans,
  listCategories,
  listPots,
  listTags,
  loadLedger,
  type MonthWindow,
} from './ledger.repo'
import { projectLedger } from './projection'
import { type Scope } from './scope-filter'

/**
 * Page loaders: what each signed-in page hands its client view, read through
 * `readBackend` so an unavailable database degrades the page ("Tentar de
 * novo") instead of crashing it. All reads are scoped by `scope`.
 */

export function loadRefs(scope: Scope, today: string): Promise<BackendRead<LedgerRefs>> {
  return readBackend('ledger refs', async () => {
    const [banks, accounts, categories, pots, tags] = await Promise.all([
      listBanks(scope),
      listAccounts(scope),
      listCategories(scope),
      listPots(scope),
      listTags(scope),
    ])
    return { banks, accounts, categories, pots, tags, today }
  })
}

export function loadCountFrom(scope: Scope): Promise<BackendRead<Month | null>> {
  return readBackend('count from', () => getCountFrom(scope))
}

/**
 * The ledger over `window`, loaded from `count_from_month` when that is
 * earlier, so the client projection accumulates balances correctly.
 */
export function loadLedgerData(
  scope: Scope,
  window: MonthWindow,
  countFrom: Month | null,
): Promise<BackendRead<LedgerData>> {
  return readBackend('ledger', async () => {
    const from = countFrom !== null && countFrom < window.from ? countFrom : window.from
    return loadLedger(scope, { from, to: window.to })
  })
}

/** Budget versions of the user, oldest first. */
export function loadBudgetPlans(scope: Scope): Promise<BackendRead<BudgetPlan[]>> {
  return readBackend('budget plans', () => listBudgetPlans(scope))
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
  scope: Scope,
  first: Month,
  later: Month,
): Promise<BackendRead<AccountsData>> {
  return readBackend('account balances', async () => {
    const { months } = await projectLedger(scope, { from: first, to: later })
    return {
      firstMonth: first,
      laterMonth: later,
      firstClosing: months.at(0)?.closingBalances ?? null,
      laterClosing: months.at(-1)?.closingBalances ?? null,
    }
  })
}
