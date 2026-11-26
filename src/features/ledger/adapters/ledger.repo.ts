import 'server-only'

import {
  accounts,
  banks,
  budgetGroups,
  budgetGroupTargets,
  budgetVersions,
  categories,
  entries,
  entryOverrides,
  entryParts,
  occurrencePayments,
} from '@/db/schema'
import { bankFeedAccounts } from '@/db/schema-bank-feed'
import { addMonths, monthFromDate, monthToDate, type Month } from '@/features/ledger/core/month'
import type { OccurrencePayment } from '@/features/ledger/core/payments'
import type {
  Account,
  Bank,
  BudgetGroup,
  BudgetVersion,
  Category,
  Entry,
  EntryOverride,
  EntryPart,
} from '@/features/ledger/core/types'
import { isBudgetGroupColor } from '@/features/ledger/core/types'
import { fluxiDb } from '@/lib/db'
import { and, asc, gte, inArray, isNotNull, isNull, lte, ne, or, sql } from 'drizzle-orm'
import { inScope, type Scope } from './scope-filter'

/**
 * Read side of the ledger. Every query is scoped by `scope` (the session user and
 * the active space, resolved by the caller): there is no unscoped read in this module.
 */

export type MonthWindow = { from: Month; to: Month }

/** Earliest month a window can start at: loading from it reads every entry up to `to`. */
export const EPOCH: Month = '1900-01'

export type LedgerSnapshot = {
  banks: Bank[]
  accounts: Account[]
  categories: Category[]
  budgetGroups: BudgetGroup[]
  entries: Entry[]
  parts: EntryPart[]
  overrides: EntryOverride[]
  payments: OccurrencePayment[]
  /** Fluxi accounts a bank feed is mapped to. */
  connectedAccountIds: string[]
}

const db = () => fluxiDb.db()

/** Whether an `entries` row was materialized from a bank transaction. */
export const isFromBank = sql<boolean>`exists (
  select 1 from bank_entry_links l where l.entry_id = "entries"."id"
)`.mapWith(Boolean)

/**
 * The merchant Pluggy identified for a bank entry's transaction (a transfer's
 * outgoing side first), null for manual entries or when the bank gave none.
 * Extra information only: the description stays the bank's.
 */
export const bankMerchant = sql<string | null>`(
  select nullif(btrim(t.merchant_name), '')
  from bank_entry_links l
  join bank_transactions t on t.id = l.bank_transaction_id and t.space_id = l.space_id
  where l.entry_id = "entries"."id" and nullif(btrim(t.merchant_name), '') is not null
  order by t.amount_cents, t.id
  limit 1
)`
const monthOrNull = (value: string | null) => (value === null ? null : monthFromDate(value))

export async function listBanks(scope: Scope): Promise<Bank[]> {
  const rows = await db()
    .select()
    .from(banks)
    .where(inScope(banks, scope))
    .orderBy(asc(banks.sort), asc(banks.name))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sort: r.sort,
    archived: r.archivedAt !== null,
  }))
}

export async function listAccounts(scope: Scope): Promise<Account[]> {
  const rows = await db()
    .select()
    .from(accounts)
    .where(inScope(accounts, scope))
    .orderBy(asc(accounts.name))
  return rows.map((r) => ({
    id: r.id,
    bankId: r.bankId,
    name: r.name,
    type: r.type,
    openingBalanceCents: r.openingBalanceCents,
    archived: r.archivedAt !== null,
  }))
}

export async function listCategories(scope: Scope): Promise<Category[]> {
  const rows = await db()
    .select()
    .from(categories)
    .where(inScope(categories, scope))
    .orderBy(asc(categories.sort), asc(categories.groupName), asc(categories.name))
  return rows.map((r) => ({
    id: r.id,
    groupName: r.groupName,
    name: r.name,
    defaultBudgetGroup: r.defaultBudgetGroup,
    archived: r.archivedAt !== null,
  }))
}

/** Every budget group of `scope`, archived ones included, in the user's order. */
export async function listBudgetGroups(scope: Scope): Promise<BudgetGroup[]> {
  const rows = await db()
    .select()
    .from(budgetGroups)
    .where(inScope(budgetGroups, scope))
    .orderBy(asc(budgetGroups.sort), asc(budgetGroups.createdAt))
  return rows.map((r) => ({
    key: r.key,
    name: r.name,
    // The column is free text; an unknown color falls back to gray.
    color: isBudgetGroupColor(r.color) ? r.color : 'slate',
    goal: r.goal === 'minimum' ? 'minimum' : 'limit',
    sort: r.sort,
    archived: r.archivedAt !== null,
  }))
}

/** Budget versions of `scope`, oldest first, each with its targets. */
export async function listBudgetVersions(scope: Scope): Promise<BudgetVersion[]> {
  const [versionRows, targetRows] = await Promise.all([
    db()
      .select()
      .from(budgetVersions)
      .where(inScope(budgetVersions, scope))
      .orderBy(asc(budgetVersions.startsMonth)),
    db().select().from(budgetGroupTargets).where(inScope(budgetGroupTargets, scope)),
  ])
  return versionRows.map((version) => ({
    id: version.id,
    startsMonth: monthFromDate(version.startsMonth),
    targets: Object.fromEntries(
      targetRows.filter((t) => t.versionId === version.id).map((t) => [t.budgetGroup, t.targetBps]),
    ),
  }))
}

/**
 * Entries that may land in `window`: started by its end and not ended before
 * the month preceding it (a `nextMonth` part of that occurrence lands in
 * `from`). A superset; the core decides what actually lands.
 */
export async function listEntries(scope: Scope, window: MonthWindow): Promise<Entry[]> {
  const lookBack = monthToDate(addMonths(window.from, -1))
  const rows = await db()
    .select({ entry: entries, fromBank: isFromBank, merchantName: bankMerchant })
    .from(entries)
    .where(
      and(
        inScope(entries, scope),
        lte(entries.startMonth, monthToDate(window.to)),
        or(isNull(entries.endMonth), gte(entries.endMonth, lookBack)),
        or(ne(entries.recurrence, 'none'), gte(entries.startMonth, lookBack)),
      ),
    )
    .orderBy(asc(entries.startMonth), asc(entries.createdAt), asc(entries.id))
  return rows.map(({ entry: r, fromBank, merchantName }) => ({
    id: r.id,
    kind: r.kind,
    description: r.description,
    amountCents: r.amountCents,
    accountId: r.accountId,
    toAccountId: r.toAccountId,
    categoryId: r.categoryId,
    budgetGroup: r.budgetGroup,
    tags: r.tags,
    startMonth: monthFromDate(r.startMonth),
    day: r.day,
    recurrence: r.recurrence,
    repeatEvery: r.repeatEvery,
    monthBy: r.monthBy,
    installments: r.installments,
    endMonth: monthOrNull(r.endMonth),
    fromBank,
    merchantName,
  }))
}

export async function listEntryParts(
  scope: Scope,
  entryIds: readonly string[],
): Promise<EntryPart[]> {
  if (entryIds.length === 0) return []
  const rows = await db()
    .select()
    .from(entryParts)
    .where(and(inScope(entryParts, scope), inArray(entryParts.entryId, [...entryIds])))
    .orderBy(asc(entryParts.entryId), asc(entryParts.sort))
  return rows.map((r) => ({
    id: r.id,
    entryId: r.entryId,
    label: r.label,
    bps: r.bps,
    day: r.day,
    nextMonth: r.nextMonth,
    sort: r.sort,
  }))
}

/** Overrides of `entryIds` for the window (plus the month before it, see {@link listEntries}). */
export async function listEntryOverrides(
  scope: Scope,
  entryIds: readonly string[],
  window: MonthWindow,
): Promise<EntryOverride[]> {
  if (entryIds.length === 0) return []
  const rows = await db()
    .select()
    .from(entryOverrides)
    .where(
      and(
        inScope(entryOverrides, scope),
        inArray(entryOverrides.entryId, [...entryIds]),
        gte(entryOverrides.month, monthToDate(addMonths(window.from, -1))),
        lte(entryOverrides.month, monthToDate(window.to)),
      ),
    )
    .orderBy(asc(entryOverrides.entryId), asc(entryOverrides.month))
  return rows.map((r) => ({
    entryId: r.entryId,
    month: monthFromDate(r.month),
    amountCents: r.amountCents,
    day: r.day,
    skipped: r.skipped,
    deleted: r.deleted,
  }))
}

/** Payments of `entryIds` for the window (plus the month before it, see {@link listEntries}). */
export async function listOccurrencePayments(
  scope: Scope,
  entryIds: readonly string[],
  window: MonthWindow,
): Promise<OccurrencePayment[]> {
  if (entryIds.length === 0) return []
  const rows = await db()
    .select()
    .from(occurrencePayments)
    .where(
      and(
        inScope(occurrencePayments, scope),
        inArray(occurrencePayments.entryId, [...entryIds]),
        gte(occurrencePayments.month, monthToDate(addMonths(window.from, -1))),
        lte(occurrencePayments.month, monthToDate(window.to)),
      ),
    )
    .orderBy(asc(occurrencePayments.entryId), asc(occurrencePayments.month))
  return rows.map((r) => ({
    entryId: r.entryId,
    month: monthFromDate(r.month),
    partId: r.partId,
    paidOn: r.paidOn,
  }))
}

/** Fluxi accounts of `scope` with a mapped bank feed (their past is the bank's). */
export async function listConnectedAccountIds(scope: Scope): Promise<string[]> {
  const rows = await db()
    .selectDistinct({ accountId: bankFeedAccounts.accountId })
    .from(bankFeedAccounts)
    .where(and(inScope(bankFeedAccounts, scope), isNotNull(bankFeedAccounts.accountId)))
  return rows.flatMap((r) => (r.accountId === null ? [] : [r.accountId])).sort()
}

/** Last 4 digits of the bank accounts / cards mapped onto each account of `scope`. */
export async function listConnectedNumberHints(scope: Scope): Promise<Record<string, string[]>> {
  const rows = await db()
    .select({ accountId: bankFeedAccounts.accountId, hint: bankFeedAccounts.numberHint })
    .from(bankFeedAccounts)
    .where(
      and(
        inScope(bankFeedAccounts, scope),
        isNotNull(bankFeedAccounts.accountId),
        isNotNull(bankFeedAccounts.numberHint),
      ),
    )
  const hints: Record<string, string[]> = {}
  for (const { accountId, hint } of rows) {
    if (accountId === null || hint === null) continue
    hints[accountId] = [...(hints[accountId] ?? []), hint].sort()
  }
  return hints
}

/** Everything the core needs to project `scope`'s ledger over `window`. */
export async function loadLedger(scope: Scope, window: MonthWindow): Promise<LedgerSnapshot> {
  const [bankRows, accountRows, categoryRows, budgetGroupRows, entryRows, connectedAccountIds] =
    await Promise.all([
      listBanks(scope),
      listAccounts(scope),
      listCategories(scope),
      listBudgetGroups(scope),
      listEntries(scope, window),
      listConnectedAccountIds(scope),
    ])
  const entryIds = entryRows.map((e) => e.id)
  const [parts, overrides, payments] = await Promise.all([
    listEntryParts(scope, entryIds),
    listEntryOverrides(scope, entryIds, window),
    listOccurrencePayments(scope, entryIds, window),
  ])
  return {
    banks: bankRows,
    accounts: accountRows,
    categories: categoryRows,
    budgetGroups: budgetGroupRows,
    entries: entryRows,
    parts,
    overrides,
    payments,
    connectedAccountIds,
  }
}

/** Distinct tags across `scope`'s entries, sorted, for the form's tags autocomplete. */
export async function listTags(scope: Scope): Promise<string[]> {
  const rows = await db()
    .selectDistinct({ tag: sql<string>`unnest(${entries.tags})` })
    .from(entries)
    .where(inScope(entries, scope))
  return rows.map((r) => r.tag).sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
