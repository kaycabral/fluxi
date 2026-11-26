import 'server-only'

import { monthRange } from '@/features/ledger/core/month'
import {
  firstLandingMonth,
  projectMonths,
  type MonthResult,
} from '@/features/ledger/core/projection'
import { EPOCH, loadLedger, type LedgerSnapshot, type MonthWindow } from './ledger.repo'
import { type Scope } from './scope-filter'

export type LedgerProjection = {
  ledger: LedgerSnapshot
  /** Only the months of the requested window. */
  months: MonthResult[]
}

/**
 * Project `scope`'s ledger over `window`. Balances accumulate from each
 * account's opening balance over every entry, so the whole ledger up to
 * `window.to` is loaded, the projection runs from the first month an entry
 * lands in and the earlier months are dropped from the result.
 */
export async function projectLedger(
  scope: Scope,
  window: MonthWindow,
  /** `YYYY-MM-DD`: applies the bank-fed accounts rule (`FeedRule`); null = no rule. */
  today: string | null = null,
): Promise<LedgerProjection> {
  const ledger = await loadLedger(scope, { from: EPOCH, to: window.to })
  const first = firstLandingMonth(ledger.entries)
  const start = first !== null && first < window.from ? first : window.from
  const months = projectMonths({
    entries: ledger.entries,
    parts: ledger.parts,
    overrides: ledger.overrides,
    accounts: ledger.accounts,
    months: monthRange(start, window.to),
    feed:
      today === null
        ? undefined
        : {
            connectedAccountIds: ledger.connectedAccountIds,
            bankEntryIds: ledger.bankEntryIds,
            today,
          },
  }).filter((m) => m.month >= window.from)
  return { ledger, months }
}
