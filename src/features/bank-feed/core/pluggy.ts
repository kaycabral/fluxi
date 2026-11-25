import { z } from 'zod'

/**
 * Pure mapping of Pluggy API payloads (accounts-list, transactions-list-by-
 * cursor, items-retrieve) onto bank-feed rows. Only the fields the feed keeps
 * are parsed: counterparty documents (`paymentData`), account numbers and owner
 * tax ids never leave this module.
 */

export const PLUGGY_SOURCE = 'pluggy'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/)

export const pluggyItemSchema = z.object({
  id: z.string(),
  status: z.string(),
  executionStatus: z.string().nullish(),
  lastUpdatedAt: z.string().nullish(),
  connector: z.object({ name: z.string() }).nullish(),
})
export type PluggyItem = z.infer<typeof pluggyItemSchema>

export const pluggyAccountSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  type: z.enum(['BANK', 'CREDIT']),
  subtype: z.string(),
  name: z.string(),
  marketingName: z.string().nullish(),
  balance: z.number(),
  currencyCode: z.string(),
})
export type PluggyAccount = z.infer<typeof pluggyAccountSchema>

export const pluggyTransactionSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  description: z.string(),
  amount: z.number(),
  amountInAccountCurrency: z.number().nullish(),
  date: isoDate,
  type: z.enum(['DEBIT', 'CREDIT']),
  status: z.enum(['POSTED', 'PENDING']).nullish(),
  category: z.string().nullish(),
  creditCardMetadata: z
    .object({
      installmentNumber: z.number().nullish(),
      totalInstallments: z.number().nullish(),
      billForecastDate: z.string().nullish(),
    })
    .nullish(),
})
export type PluggyTransaction = z.infer<typeof pluggyTransactionSchema>

export const transactionsPageSchema = z.object({
  results: z.array(z.unknown()),
  next: z.string().nullable(),
})

/** Statuses after which the item's data is final for this sync. */
const READY_STATUSES = new Set(['UPDATED'])

export type ItemReadiness = { ready: boolean; reason: string }

export function itemReadiness(item: PluggyItem): ItemReadiness {
  if (READY_STATUSES.has(item.status)) return { ready: true, reason: item.status }
  const detail = item.executionStatus ? ` (${item.executionStatus})` : ''
  return { ready: false, reason: `${item.status}${detail}` }
}

/**
 * Open Finance serves a rolling 12-month window (Resolução Conjunta nº 1).
 * The feed only trusts "missing = removed" a few days inside it, so a row at
 * the window's edge is never deleted just because it rolled out.
 */
export const COVERED_DAYS = 360

export function coveredFrom(today: string): string {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - COVERED_DAYS)
  return d.toISOString().slice(0, 10)
}

export const toCents = (value: number): number => Math.round(Math.abs(value) * 100)

export type FeedAccountRow = {
  externalId: string
  itemId: string
  institution: string
  name: string
  type: string
  subtype: string
  balanceCents: number
}

export function toFeedAccount(account: PluggyAccount, institution: string): FeedAccountRow {
  // Pluggy reports both a checking balance and a card's open bill as positive.
  const sign = account.balance < 0 ? -1 : 1
  return {
    externalId: account.id,
    itemId: account.itemId,
    institution,
    name: account.marketingName?.trim() || account.name,
    type: account.type,
    subtype: account.subtype,
    balanceCents: sign * toCents(account.balance),
  }
}

export type FeedTransactionRow = {
  externalId: string
  date: string
  amountCents: number
  description: string
  status: 'POSTED' | 'PENDING'
  category: string | null
  installmentNumber: number | null
  totalInstallments: number | null
  billMonth: string | null
}

const BILL_MONTH = /^(\d{4})-(\d{2})$/

function billMonthOf(forecast: string | null | undefined): string | null {
  const match = forecast ? BILL_MONTH.exec(forecast) : null
  return match ? `${match[1]}-${match[2]}-01` : null
}

/**
 * The direction comes from `type`, never from the sign of `amount`: Pluggy
 * normalizes card purchases to DEBIT while their `amount` stays positive.
 */
export function toFeedTransaction(tx: PluggyTransaction): FeedTransactionRow {
  const value = tx.amountInAccountCurrency ?? tx.amount
  const card = tx.creditCardMetadata
  return {
    externalId: tx.id,
    date: tx.date.slice(0, 10),
    amountCents: (tx.type === 'DEBIT' ? -1 : 1) * toCents(value),
    description: tx.description.trim(),
    status: tx.status ?? 'POSTED',
    category: tx.category ?? null,
    installmentNumber: card?.installmentNumber ?? null,
    totalInstallments: card?.totalInstallments ?? null,
    billMonth: billMonthOf(card?.billForecastDate),
  }
}

export type PluggyConfig = { clientId: string; clientSecret: string; itemIds: string[] }

/** Parses `KEY=value` lines (the `~/.config/fluxi/pluggy.env` format); env wins. */
export function parsePluggyConfig(
  file: string,
  env: Readonly<Record<string, string | undefined>>,
): PluggyConfig {
  const fromFile = new Map<string, string>()
  for (const line of file.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq > 0) fromFile.set(trimmed.slice(0, eq).trim(), trimmed.slice(eq + 1).trim())
  }
  const read = (key: string) => env[key]?.trim() || fromFile.get(key) || ''
  const clientId = read('PLUGGY_CLIENT_ID')
  const clientSecret = read('PLUGGY_CLIENT_SECRET')
  const itemIds = read('PLUGGY_ITEM_IDS')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  const missing = [
    !clientId && 'PLUGGY_CLIENT_ID',
    !clientSecret && 'PLUGGY_CLIENT_SECRET',
    itemIds.length === 0 && 'PLUGGY_ITEM_IDS',
  ].filter(Boolean)
  if (missing.length > 0) {
    throw new Error(`missing ${missing.join(', ')} (env or ~/.config/fluxi/pluggy.env)`)
  }
  return { clientId, clientSecret, itemIds }
}
