import type { Month } from './month'

/**
 * Domain types of the ledger, mirroring `src/db/schema.ts` with months as
 * {@link Month} and money as integer cents. Basis points: 10000 = 100%.
 */

/** Stable id of a pot (`pots.key`): the 6 seeded pots keep their historic keys. */
export type PotKey = string

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

/** The 14 colors a pot can take (Tailwind palette names). */
export const POT_COLORS = [
  'violet',
  'orange',
  'pink',
  'emerald',
  'yellow',
  'blue',
  'sky',
  'rose',
  'teal',
  'lime',
  'amber',
  'indigo',
  'fuchsia',
  'slate',
] as const
export type PotColor = (typeof POT_COLORS)[number]

/** `limit`: spend up to the target. `minimum`: put aside at least the target (investment). */
export type PotGoal = 'limit' | 'minimum'

export type Pot = {
  key: PotKey
  name: string
  color: PotColor
  goal: PotGoal
  sort: number
  archived: boolean
}

/** A budget version: pot targets (bps of income) from `startsMonth` until the next plan. */
export type BudgetPlan = {
  id: string
  startsMonth: Month
  /** Missing pot = 0%. */
  targets: Record<PotKey, number>
}

export type Entry = {
  id: string
  kind: EntryKind
  description: string
  /**
   * Amount of each occurrence, signed from `accountId`'s point of view
   * (negative = money leaves it): an expense is normally negative (positive =
   * refund), an income positive (negative = reversal), a transfer always
   * negative. For `installments`, the TOTAL (see `seriesAmountFor`).
   */
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
  /** Signed like the entry's amount; null = the series amount. */
  amountCents: number | null
  day: number | null
  /** No occurrence this month (never counts). */
  skipped: boolean
  /** Deleted by the user ("Só este mês"): skipped and never shown, unlike a month the import skipped. */
  deleted: boolean
}

export function isPotColor(value: string): value is PotColor {
  return POT_COLORS.some((color) => color === value)
}
