import { addMonths, type Month } from './month'
import type { Balances } from './projection'

/** Months the timeline shows: 3 before the count start (or today) up to 24 after today. */
export function timelineWindow(countFrom: Month | null, today: Month): { from: Month; to: Month } {
  const anchor = countFrom !== null && countFrom < today ? countFrom : today
  return { from: addMonths(anchor, -3), to: addMonths(today, 24) }
}

/** Sum of `ids` in a balance snapshot; null when the month is not counted. */
export function sumBalances(balances: Balances | null, ids: readonly string[]): number | null {
  if (balances === null) return null
  return ids.reduce((sum, id) => sum + (balances[id] ?? 0), 0)
}

/** Month to open in the timeline: today when counted, else the count start. */
export function initialSelectedMonth(countFrom: Month | null, today: Month): Month {
  return countFrom !== null && countFrom > today ? countFrom : today
}
