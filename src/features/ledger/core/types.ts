import type { Month } from './month'

/**
 * Domain types of the ledger, mirroring `src/db/schema.ts` with months as
 * {@link Month} and money as integer cents. Basis points: 10000 = 100%.
 */

export const POT_KEYS = [
  'essential',
  'comfort',
  'guilt_free',
  'education',
  'variable',
  'investment',
] as const
export type PotKey = (typeof POT_KEYS)[number]

export type AccountType = 'checking' | 'credit' | 'benefit' | 'investment' | 'loan'
export type EntryKind = 'income' | 'expense' | 'transfer'
export type Recurrence = 'none' | 'monthly' | 'yearly' | 'installments'
/**
 * Which day a monthly series lands on (Google Calendar's options): the same
 * day number, the same nth weekday ("4ª quinta-feira") or the last such
 * weekday of the month, all taken from the start date.
 */
export type MonthBy = 'day' | 'weekday' | 'last_weekday'

export type Bank = {
  id: string
  name: string
  sort: number
  archived: boolean
}

export type Account = {
  id: string
  bankId: string
  name: string
  type: AccountType
  openingBalanceCents: number
  archived: boolean
}

export type Category = {
  id: string
  groupName: string
  name: string
  defaultPot: PotKey | null
  archived: boolean
}

export type BudgetPot = {
  key: PotKey
  targetBps: number
}

export type Entry = {
  id: string
  kind: EntryKind
  description: string
  /** Amount of each occurrence; for `installments`, the TOTAL (see `seriesAmountFor`). */
  amountCents: number
  accountId: string
  toAccountId: string | null
  categoryId: string | null
  pot: PotKey | null
  tags: readonly string[]
  startMonth: Month
  day: number
  recurrence: Recurrence
  /** Every N months (monthly) or N years (yearly); 1 otherwise. */
  repeatEvery: number
  /** `day` unless a monthly series lands on a weekday. */
  monthBy: MonthBy
  installments: number | null
  endMonth: Month | null
}

export type EntryPart = {
  id: string
  entryId: string
  label: string
  bps: number
  day: number
  nextMonth: boolean
  sort: number
}

export type EntryOverride = {
  entryId: string
  month: Month
  amountCents: number | null
  day: number | null
  /** No occurrence this month (never counts). */
  skipped: boolean
  /** Deleted by the user ("Só este mês"): skipped and never shown, unlike a month the import skipped. */
  deleted: boolean
}

export function isPotKey(value: string): value is PotKey {
  return POT_KEYS.some((key) => key === value)
}
