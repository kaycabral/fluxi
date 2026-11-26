import 'server-only'

import { monthRange, type Month } from '@/features/ledger/core/month'
import { projectMonths, type MonthResult } from '@/features/ledger/core/projection'
import { getCountFrom, loadLedger, type LedgerSnapshot, type MonthWindow } from './ledger.repo'
import { type Scope } from './scope-filter'

export type LedgerProjection = {
  ledger: LedgerSnapshot
  /** Only the months of the requested window. */
  months: MonthResult[]
}

/**
 * Project `scope`'s ledger over `window`. Balances accumulate from
 * `count_from_month`, so when the window starts later the projection runs from
 * there and the earlier months are dropped from the result. Without a
 * `count_from_month` every month counts and balances start at `window.from`.
 */
export async function projectLedger(scope: Scope, window: MonthWindow): Promise<LedgerProjection> {
  const countFrom = await getCountFrom(scope)
  const start: Month = countFrom !== null && countFrom < window.from ? countFrom : window.from
  const ledger = await loadLedger(scope, { from: start, to: window.to })
  const months = projectMonths({
    entries: ledger.entries,
    parts: ledger.parts,
    overrides: ledger.overrides,
    accounts: ledger.accounts,
    months: monthRange(start, window.to),
    countFrom: ledger.countFrom,
  }).filter((m) => m.month >= window.from)
  return { ledger, months }
}
