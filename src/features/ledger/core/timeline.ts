import { addMonths, type Month } from './month'
import type { Balances } from './projection'

/** Months the timeline shows: 3 before today up to 24 after it. */
export function timelineWindow(today: Month): { from: Month; to: Month } {
  return { from: addMonths(today, -3), to: addMonths(today, 24) }
}

/** Sum of `ids` in a balance snapshot. */
export function sumBalances(balances: Balances, ids: readonly string[]): number {
  return ids.reduce((sum, id) => sum + (balances[id] ?? 0), 0)
}
