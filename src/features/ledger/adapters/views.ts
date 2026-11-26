import 'server-only'

import type { Month } from '@/features/ledger/core/month'
import type { BudgetVersion } from '@/features/ledger/core/types'
import type { LedgerData, LedgerRefs } from '@/features/ledger/core/view'
import { readBackend, type BackendRead } from '@/lib/backend-read'
import {
  EPOCH,
  listAccounts,
  listBanks,
  listBudgetGroups,
  listBudgetVersions,
  listCategories,
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
    const [banks, accounts, categories, budgetGroups, tags] = await Promise.all([
      listBanks(scope),
      listAccounts(scope),
      listCategories(scope),
      listBudgetGroups(scope),
      listTags(scope),
    ])
    return { banks, accounts, categories, budgetGroups, tags, today }
  })
}

/**
 * The ledger up to `window.to`, every entry since the first: balances
 * accumulate from the accounts' opening balances, so the client projection
 * needs the whole history before the window too. `today` (`YYYY-MM-DD`)
 * drives the bank-fed accounts rule (`FeedRule`).
 */
export function loadLedgerData(
  scope: Scope,
  window: MonthWindow,
  today: string,
): Promise<BackendRead<LedgerData>> {
  return readBackend('ledger', async () => {
    const { connectedAccountIds, ...ledger } = await loadLedger(scope, {
      from: EPOCH,
      to: window.to,
    })
    return { ...ledger, feed: { connectedAccountIds, today } }
  })
}

/** Budget versions of the user, oldest first. */
export function loadBudgetVersions(scope: Scope): Promise<BackendRead<BudgetVersion[]>> {
  return readBackend('budget versions', () => listBudgetVersions(scope))
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
  today: string,
): Promise<BackendRead<AccountsData>> {
  return readBackend('account balances', async () => {
    const { months } = await projectLedger(scope, { from: first, to: later }, today)
    return {
      firstMonth: first,
      laterMonth: later,
      firstClosing: months.at(0)?.closingBalances ?? null,
      laterClosing: months.at(-1)?.closingBalances ?? null,
    }
  })
}
