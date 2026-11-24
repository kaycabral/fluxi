import type { Month } from '@/features/ledger/core/month'
import {
  checkboxOf,
  dateOf,
  multiSelectOf,
  numberOf,
  relationOf,
  selectOf,
  textOf,
  type NotionPage,
} from './notion'

/**
 * Notion transactions flattened into importable records. A record is one
 * realized or planned money movement of one month; rows that cannot become a
 * ledger occurrence (ignored, incomplete, without a month) are only counted
 * (the raw archive keeps them).
 */

export type Movement = 'Inflow' | 'Outflow'

export type TxRecord = {
  externalId: string
  month: Month
  /** Day of the month (Due, else Date, else 1), unclamped. */
  day: number
  /** Always >= 0; a negative Notion amount flips the movement instead. */
  amountCents: number
  movement: Movement
  accountId: string
  /** Original text, whitespace collapsed. */
  description: string
  /** Grouping key of the description: collapsed and lowercased. */
  descriptionKey: string
  /** Category group with its emoji prefix stripped (e.g. "Mercado"). */
  group: string | null
  subCategory: string | null
  /** Raw Notion Type (e.g. "Guilt Free"); see {@link potOfType}. */
  type: string | null
  tags: readonly string[]
  /** When it was actually paid/received (Notion `Date`), `YYYY-MM-DD`. */
  paidOn: string | null
}

export type RecordSkips = { ignored: number; incomplete: number; noMonth: number }

export type RecordsResult = {
  records: TxRecord[]
  skipped: RecordSkips
  /** Rows with a negative amount, imported with the movement flipped. */
  negativeFlipped: number
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** Leading emoji/symbols of a category group ("🛒 Mercado" → "Mercado"). */
export function stripEmoji(name: string): string {
  return name.replace(/^[^\p{L}\p{N}]+/u, '').trim()
}

const isGroupLabel = (name: string) => /^[^\p{L}\p{N}_]/u.test(name)
const collapse = (text: string) => text.replace(/\s+/g, ' ').trim()

/**
 * Month page id → its month: the start of `Duration`, else the related year's
 * Name with the page's English month Name.
 */
export function buildMonthIndex(
  months: readonly NotionPage[],
  years: readonly NotionPage[],
): Map<string, Month> {
  const yearName = new Map(years.map((y) => [y.id, textOf(y, 'Name')]))
  const index = new Map<string, Month>()
  for (const page of months) {
    const month = monthOfMonthPage(page, yearName)
    if (month !== null) index.set(page.id, month)
  }
  return index
}

function monthOfMonthPage(page: NotionPage, yearName: Map<string, string>): Month | null {
  const duration = dateOf(page, 'Duration')
  if (duration !== null) return duration.slice(0, 7)
  const year = yearName.get(relationOf(page, 'Year')[0] ?? '')
  const monthIndex = MONTH_NAMES.indexOf(textOf(page, 'Name'))
  if (year === undefined || !/^\d{4}$/.test(year) || monthIndex < 0) return null
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`
}

function movementOf(page: NotionPage): Movement | null {
  const value = selectOf(page, 'Movement')
  return value === 'Inflow' || value === 'Outflow' ? value : null
}

const flip = (movement: Movement): Movement => (movement === 'Inflow' ? 'Outflow' : 'Inflow')

type Classified = { skip: keyof RecordSkips } | { record: TxRecord; negative: boolean }

function classify(page: NotionPage, monthIndex: Map<string, Month>): Classified {
  if (checkboxOf(page, 'Ignored')) return { skip: 'ignored' }
  const amount = numberOf(page, 'Amount')
  const movement = movementOf(page)
  const accountId = relationOf(page, 'Account')[0]
  if (amount === null || movement === null || accountId === undefined) {
    return { skip: 'incomplete' }
  }
  const due = dateOf(page, 'Due')
  const paidOn = dateOf(page, 'Date')
  const dayDate = due ?? paidOn
  const month = monthIndex.get(relationOf(page, 'Month')[0] ?? '') ?? dayDate?.slice(0, 7)
  if (month === undefined) return { skip: 'noMonth' }

  const categories = multiSelectOf(page, 'Category')
  const group = categories.find(isGroupLabel)
  const description = collapse(textOf(page, 'Description'))
  const record: TxRecord = {
    externalId: page.id,
    month,
    day: dayDate === undefined || dayDate === null ? 1 : Number(dayDate.slice(8, 10)),
    amountCents: Math.abs(Math.round(amount * 100)),
    movement: amount < 0 ? flip(movement) : movement,
    accountId,
    description,
    descriptionKey: description.toLowerCase(),
    group: group === undefined ? null : stripEmoji(group),
    subCategory: categories.find((c) => !isGroupLabel(c)) ?? null,
    type: selectOf(page, 'Type'),
    tags: [...multiSelectOf(page, 'Tags')].sort(),
    paidOn: paidOn?.slice(0, 10) ?? null,
  }
  return { record, negative: amount < 0 }
}

/** Notion transactions (in source order) → importable records + skip counts. */
export function toRecords(
  transactions: readonly NotionPage[],
  monthIndex: Map<string, Month>,
): RecordsResult {
  const result: RecordsResult = {
    records: [],
    skipped: { ignored: 0, incomplete: 0, noMonth: 0 },
    negativeFlipped: 0,
  }
  for (const page of transactions) {
    const classified = classify(page, monthIndex)
    if ('skip' in classified) {
      result.skipped[classified.skip] += 1
      continue
    }
    result.records.push(classified.record)
    if (classified.negative) result.negativeFlipped += 1
  }
  return result
}
