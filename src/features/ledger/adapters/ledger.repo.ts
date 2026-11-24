import 'server-only'

import {
  accounts,
  banks,
  budgetPots,
  categories,
  entries,
  entryOverrides,
  entryParts,
  userSettings,
} from '@/db/schema'
import { addMonths, monthFromDate, monthToDate, type Month } from '@/features/ledger/core/month'
import type {
  Account,
  Bank,
  BudgetPot,
  Category,
  Entry,
  EntryOverride,
  EntryPart,
} from '@/features/ledger/core/types'
import { fluxiDb } from '@/lib/db'
import { and, asc, eq, gte, inArray, isNull, lte, ne, or } from 'drizzle-orm'

/**
 * Read side of the ledger. Every query is scoped by `userId` (the session
 * user, resolved by the caller): there is no unscoped read in this module.
 */

export type MonthWindow = { from: Month; to: Month }

export type LedgerSnapshot = {
  banks: Bank[]
  accounts: Account[]
  categories: Category[]
  pots: BudgetPot[]
  countFrom: Month | null
  entries: Entry[]
  parts: EntryPart[]
  overrides: EntryOverride[]
}

const db = () => fluxiDb.db()
const monthOrNull = (value: string | null) => (value === null ? null : monthFromDate(value))

export async function listBanks(userId: string): Promise<Bank[]> {
  const rows = await db()
    .select()
    .from(banks)
    .where(eq(banks.userId, userId))
    .orderBy(asc(banks.sort), asc(banks.name))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sort: r.sort,
    archived: r.archivedAt !== null,
  }))
}

export async function listAccounts(userId: string): Promise<Account[]> {
  const rows = await db()
    .select()
    .from(accounts)
    .where(eq(accounts.userId, userId))
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

export async function listCategories(userId: string): Promise<Category[]> {
  const rows = await db()
    .select()
    .from(categories)
    .where(eq(categories.userId, userId))
    .orderBy(asc(categories.sort), asc(categories.groupName), asc(categories.name))
  return rows.map((r) => ({
    id: r.id,
    groupName: r.groupName,
    name: r.name,
    defaultPot: r.defaultPot,
    archived: r.archivedAt !== null,
  }))
}

export async function listBudgetPots(userId: string): Promise<BudgetPot[]> {
  const rows = await db()
    .select({ key: budgetPots.key, targetBps: budgetPots.targetBps })
    .from(budgetPots)
    .where(eq(budgetPots.userId, userId))
    .orderBy(asc(budgetPots.sort))
  return rows
}

export async function getCountFrom(userId: string): Promise<Month | null> {
  const [row] = await db()
    .select({ countFromMonth: userSettings.countFromMonth })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1)
  return monthOrNull(row?.countFromMonth ?? null)
}

/**
 * Entries that may land in `window`: started by its end and not ended before
 * the month preceding it (a `nextMonth` part of that occurrence lands in
 * `from`). A superset; the core decides what actually lands.
 */
export async function listEntries(userId: string, window: MonthWindow): Promise<Entry[]> {
  const lookBack = monthToDate(addMonths(window.from, -1))
  const rows = await db()
    .select()
    .from(entries)
    .where(
      and(
        eq(entries.userId, userId),
        lte(entries.startMonth, monthToDate(window.to)),
        or(isNull(entries.endMonth), gte(entries.endMonth, lookBack)),
        or(ne(entries.recurrence, 'none'), gte(entries.startMonth, lookBack)),
      ),
    )
    .orderBy(asc(entries.startMonth), asc(entries.createdAt), asc(entries.id))
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    description: r.description,
    amountCents: r.amountCents,
    accountId: r.accountId,
    toAccountId: r.toAccountId,
    categoryId: r.categoryId,
    pot: r.pot,
    tags: r.tags,
    startMonth: monthFromDate(r.startMonth),
    day: r.day,
    recurrence: r.recurrence,
    installments: r.installments,
    endMonth: monthOrNull(r.endMonth),
  }))
}

export async function listEntryParts(
  userId: string,
  entryIds: readonly string[],
): Promise<EntryPart[]> {
  if (entryIds.length === 0) return []
  const rows = await db()
    .select()
    .from(entryParts)
    .where(and(eq(entryParts.userId, userId), inArray(entryParts.entryId, [...entryIds])))
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
  userId: string,
  entryIds: readonly string[],
  window: MonthWindow,
): Promise<EntryOverride[]> {
  if (entryIds.length === 0) return []
  const rows = await db()
    .select()
    .from(entryOverrides)
    .where(
      and(
        eq(entryOverrides.userId, userId),
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
  }))
}

/** Everything the core needs to project `userId`'s ledger over `window`. */
export async function loadLedger(userId: string, window: MonthWindow): Promise<LedgerSnapshot> {
  const [bankRows, accountRows, categoryRows, pots, countFrom, entryRows] = await Promise.all([
    listBanks(userId),
    listAccounts(userId),
    listCategories(userId),
    listBudgetPots(userId),
    getCountFrom(userId),
    listEntries(userId, window),
  ])
  const entryIds = entryRows.map((e) => e.id)
  const [parts, overrides] = await Promise.all([
    listEntryParts(userId, entryIds),
    listEntryOverrides(userId, entryIds, window),
  ])
  return {
    banks: bankRows,
    accounts: accountRows,
    categories: categoryRows,
    pots,
    countFrom,
    entries: entryRows,
    parts,
    overrides,
  }
}

/** Distinct descriptions of `userId`'s entries, for the form's autocomplete. */
export async function listDescriptions(userId: string, limit = 300): Promise<string[]> {
  const rows = await db()
    .selectDistinct({ description: entries.description })
    .from(entries)
    .where(eq(entries.userId, userId))
    .orderBy(asc(entries.description))
    .limit(limit)
  return rows.map((r) => r.description)
}
