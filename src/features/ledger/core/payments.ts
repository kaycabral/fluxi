import { landingTouchesBucket } from './bucket'
import { isoDate } from './format'
import { addMonths, type Month } from './month'
import { isSkipped, occursIn, type Landing } from './occurrence'
import type { Account, Entry, EntryOverride, EntryPart } from './types'

/**
 * "Pago/recebido" status of occurrences. A payment is keyed like an override:
 * the entry, the occurrence's competence month and, for a split entry, the
 * part (each part is paid on its own). It is only a status: the projection
 * already counts every occurrence, paid or not.
 *
 * "Today" is always passed in (`YYYY-MM-DD` in the user's local date; the
 * server computes it in America/Sao_Paulo), so nothing here reads the clock.
 */

export type OccurrencePayment = {
  entryId: string
  /** Competence month of the occurrence. */
  month: Month
  /** The paid part of a split occurrence; null = the whole occurrence. */
  partId: string | null
  /** `YYYY-MM-DD`. */
  paidOn: string
}

/** What identifies one payable occurrence (or part of it). */
export type PaymentKey = Pick<OccurrencePayment, 'entryId' | 'month' | 'partId'>

export type PaymentStatus = 'paid' | 'overdue' | 'upcoming'

export function paymentKeyOf(landing: Landing): PaymentKey {
  return { entryId: landing.entry.id, month: landing.competence, partId: landing.part?.id ?? null }
}

export function samePaymentKey(a: PaymentKey, b: PaymentKey): boolean {
  return a.entryId === b.entryId && a.month === b.month && a.partId === b.partId
}

/** The payment of the occurrence (or part) a landing is, if any. */
export function paymentFor(
  landing: Landing,
  payments: readonly OccurrencePayment[],
): OccurrencePayment | undefined {
  const key = paymentKeyOf(landing)
  return payments.find((p) => samePaymentKey(p, key))
}

/** `YYYY-MM-DD` the money moves (the landing's month and clamped day). */
export function landingDate(landing: Landing): string {
  return isoDate(landing.month, landing.day)
}

/** Paid when there is a payment; otherwise overdue before `today`, else upcoming. */
export function paymentStatus(
  landing: Landing,
  payments: readonly OccurrencePayment[],
  today: string,
): PaymentStatus {
  if (paymentFor(landing, payments) !== undefined) return 'paid'
  return landingDate(landing) < today ? 'overdue' : 'upcoming'
}

/** `YYYY-MM-DD` plus `days` (calendar arithmetic in UTC, so no DST surprises). */
export function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number)
  const next = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (date ?? 1) + days))
  return next.toISOString().slice(0, 10)
}

export const PAYABLE_GROUP_KEYS = ['overdue', 'next7', 'restOfMonth', 'nextMonth', 'paid'] as const
export type PayableGroupKey = (typeof PAYABLE_GROUP_KEYS)[number]

export const PAYABLE_GROUP_LABELS: Record<PayableGroupKey, string> = {
  overdue: 'Atrasadas',
  next7: 'Próximos 7 dias',
  restOfMonth: 'Resto do mês',
  nextMonth: 'Próximo mês',
  paid: 'Pagos neste mês',
}

export type PayableItem = {
  landing: Landing
  date: string
  status: PaymentStatus
  payment: OccurrencePayment | null
}

export type PayableGroup = {
  key: PayableGroupKey
  label: string
  items: PayableItem[]
  /** Totals of the group by kind (always positive cents). */
  incomeCents: number
  expenseCents: number
  transferCents: number
}

/** Unpaid landings go to the first group whose window holds their date. */
function unpaidGroupOf(date: string, today: string): PayableGroupKey | null {
  const month = today.slice(0, 7)
  if (date < today) return 'overdue'
  if (date <= addDays(today, 6)) return 'next7'
  if (date.slice(0, 7) === month) return 'restOfMonth'
  if (date.slice(0, 7) === addMonths(month, 1)) return 'nextMonth'
  return null
}

function paidGroupOf(
  date: string,
  today: string,
  options: { includePaid?: boolean },
): PayableGroupKey | null {
  return options.includePaid === true && date.slice(0, 7) === today.slice(0, 7) ? 'paid' : null
}

/**
 * "A pagar": the unpaid occurrences of `landings` grouped as Atrasadas (before
 * `today`), Próximos 7 dias (today + 6), Resto do mês and Próximo mês, each in
 * date order with totals per kind. With `includePaid`, a last group lists the
 * paid occurrences that land in the current month. Empty groups are dropped.
 * The caller decides how far back "Atrasadas" looks by the landings it passes.
 */
export function groupPayables(
  landings: readonly Landing[],
  payments: readonly OccurrencePayment[],
  today: string,
  options: { includePaid?: boolean } = {},
): PayableGroup[] {
  const buckets = new Map<PayableGroupKey, PayableItem[]>()
  for (const landing of landings) {
    const date = landingDate(landing)
    const payment = paymentFor(landing, payments) ?? null
    const key = payment === null ? unpaidGroupOf(date, today) : paidGroupOf(date, today, options)
    if (key === null) continue
    const status = paymentStatus(landing, payments, today)
    const items = buckets.get(key) ?? []
    items.push({ landing, date, status, payment })
    buckets.set(key, items)
  }
  return PAYABLE_GROUP_KEYS.flatMap((key) => {
    const items = buckets.get(key)
    if (items === undefined) return []
    items.sort((a, b) => a.date.localeCompare(b.date))
    const total = (kind: Entry['kind']) =>
      items
        .filter((i) => i.landing.entry.kind === kind)
        .reduce((sum, i) => sum + i.landing.amountCents, 0)
    return [
      {
        key,
        label: PAYABLE_GROUP_LABELS[key],
        items,
        incomeCents: total('income'),
        expenseCents: total('expense'),
        transferCents: total('transfer'),
      },
    ]
  })
}

/**
 * Landings "A pagar" lists: by default only those that move available money
 * (an occurrence only in benefit accounts is not something the user pays from
 * their own money); a transfer between the buckets stays. `includeBenefits`
 * keeps everything.
 */
export function payableLandings(
  landings: readonly Landing[],
  accounts: readonly Pick<Account, 'id' | 'type'>[],
  options: { includeBenefits?: boolean } = {},
): Landing[] {
  if (options.includeBenefits === true) return [...landings]
  return landings.filter((landing) => landingTouchesBucket(landing, 'available', accounts))
}

/**
 * Months "A pagar" loads: from the count start (else the current month), at
 * most 12 months back, to the next month. Occurrences before the count start
 * are history the user is not tracking, so they never show as overdue.
 */
export function payablesWindow(countFrom: Month | null, today: Month): { from: Month; to: Month } {
  const floor = addMonths(today, -12)
  const anchor = countFrom === null || countFrom > today ? today : countFrom
  return { from: anchor < floor ? floor : anchor, to: addMonths(today, 1) }
}

/** Pair each part of `next` with the part at the same position in `previous` (keeps its id). */
export function keepPartIds(
  next: readonly EntryPart[],
  previous: readonly EntryPart[],
): EntryPart[] {
  const ordered = [...previous].sort((a, b) => a.sort - b.sort)
  return next.map((part, index) => {
    const kept = ordered[index]
    return kept === undefined ? part : { ...part, id: kept.id }
  })
}

/**
 * Payments that no longer match an occurrence of the (edited) series: a month
 * the entry no longer occurs in or skips, a whole-occurrence payment of an
 * entry that is now split, or a part payment of one that no longer is.
 */
export function stalePayments<P extends OccurrencePayment>(
  entry: Entry,
  parts: readonly EntryPart[],
  overrides: readonly EntryOverride[],
  payments: readonly P[],
): P[] {
  const own = parts.filter((p) => p.entryId === entry.id)
  return payments.filter((p) => {
    if (p.entryId !== entry.id) return false
    if (!occursIn(entry, p.month) || isSkipped(entry, overrides, p.month)) return true
    if (p.partId === null) return own.length > 0
    return !own.some((part) => part.id === p.partId)
  })
}

/**
 * Where the payments of a series go when a `future` edit splits it at
 * `month`: those from `month` on move to the new entry, each part payment to
 * the copy of its part (matched by position). Earlier payments stay.
 */
export function splitPayments<P extends OccurrencePayment>(
  payments: readonly P[],
  split: { fromEntryId: string; toEntryId: string; month: Month },
  fromParts: readonly EntryPart[],
  toParts: readonly EntryPart[],
): P[] {
  const from = [...fromParts].sort((a, b) => a.sort - b.sort)
  const to = [...toParts].sort((a, b) => a.sort - b.sort)
  return payments.flatMap((p) => {
    if (p.entryId !== split.fromEntryId || p.month < split.month) return [p]
    if (p.partId === null) return [{ ...p, entryId: split.toEntryId }]
    const copy = to[from.findIndex((part) => part.id === p.partId)]
    return copy === undefined ? [] : [{ ...p, entryId: split.toEntryId, partId: copy.id }]
  })
}
