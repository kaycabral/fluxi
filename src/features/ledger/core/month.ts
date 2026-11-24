/**
 * A calendar month as `YYYY-MM`. Lexicographic order is chronological, so
 * months compare with `<`/`>=`. The database stores months as a `date` on the
 * 1st; adapters convert with {@link monthFromDate} / {@link monthToDate}.
 */
export type Month = string

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/

function parse(month: Month): { year: number; monthIndex: number } {
  const match = MONTH_PATTERN.exec(month)
  if (match === null) throw new RangeError(`invalid month: ${month}`)
  return { year: Number(match[1]), monthIndex: Number(match[2]) - 1 }
}

function format(year: number, monthIndex: number): Month {
  return `${String(year).padStart(4, '0')}-${String(monthIndex + 1).padStart(2, '0')}`
}

export function addMonths(month: Month, count: number): Month {
  const { year, monthIndex } = parse(month)
  const total = year * 12 + monthIndex + count
  return format(Math.floor(total / 12), ((total % 12) + 12) % 12)
}

/** Whole months from `from` to `to` (negative when `to` is earlier). */
export function diffMonths(from: Month, to: Month): number {
  const a = parse(from)
  const b = parse(to)
  return (b.year - a.year) * 12 + (b.monthIndex - a.monthIndex)
}

export function daysInMonth(month: Month): number {
  const { year, monthIndex } = parse(month)
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

/** Inclusive, ascending; empty when `to` is before `from`. */
export function monthRange(from: Month, to: Month): Month[] {
  const length = diffMonths(from, to) + 1
  return Array.from({ length: Math.max(0, length) }, (_, i) => addMonths(from, i))
}

/** `YYYY-MM-DD` (a Postgres `date`) → its month. */
export function monthFromDate(isoDate: string): Month {
  const month = isoDate.slice(0, 7)
  parse(month)
  return month
}

/** Month → the `date` on its 1st, as stored in Postgres. */
export function monthToDate(month: Month): string {
  parse(month)
  return `${month}-01`
}

/** Weekday (Sunday = 0) of `day` of `month`. */
export function weekdayIn(month: Month, day: number): number {
  const { year, monthIndex } = parse(month)
  return new Date(Date.UTC(year, monthIndex, day)).getUTCDay()
}

/** Day of the `nth` (1–5) `weekday` of `month`; the last one when there is no `nth`. */
export function nthWeekdayDay(month: Month, weekday: number, nth: number): number {
  const first = 1 + ((weekday - weekdayIn(month, 1) + 7) % 7)
  const last = daysInMonth(month)
  const day = first + 7 * (nth - 1)
  return day <= last ? day : first + 7 * Math.floor((last - first) / 7)
}

/** Day of the last `weekday` of `month`. */
export function lastWeekdayDay(month: Month, weekday: number): number {
  return nthWeekdayDay(month, weekday, 5)
}
