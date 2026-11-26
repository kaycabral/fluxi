import 'server-only'

import type { Month } from '@/features/ledger/core/month'
import type { BudgetPlan } from '@/features/ledger/core/types'
import type { LedgerData, LedgerRefs } from '@/features/ledger/core/view'
import { readBackend, type BackendRead } from '@/lib/backend-read'
import {
  EPOCH,
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

/**
 * The ledger up to `window.to`, every entry since the first: balances
 * accumulate from the accounts' opening balances, so the client projection
 * needs the whole history before the window too.
 */
export function loadLedgerData(
  scope: Scope,
  window: MonthWindow,
): Promise<BackendRead<LedgerData>> {
  return readBackend('ledger', () => loadLedger(scope, { from: EPOCH, to: window.to }))
}

/** Budget versions of the user, oldest first. */
export function loadBudgetPlans(scope: Scope): Promise<BackendRead<BudgetPlan[]>> {
  return readBackend('budget plans', () => listBudgetPlans(scope))
}

export type AccountsData = {
  firstMonth: Month
  laterMonth: Month
  /** Balance per account at the end of each month (null when it was not projected). */
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
