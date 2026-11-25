import 'server-only'

import {
  accounts,
  banks,
  budgetPlans,
  budgetPlanTargets,
  categories,
  entries,
  entryOverrides,
  entryParts,
  occurrencePayments,
  pots,
  userSettings,
} from '@/db/schema'
import { addMonths, monthFromDate, monthToDate, type Month } from '@/features/ledger/core/month'
import type { OccurrencePayment } from '@/features/ledger/core/payments'
import type {
  Account,
  Bank,
  BudgetPlan,
  Category,
  Entry,
  EntryOverride,
  EntryPart,
  Pot,
} from '@/features/ledger/core/types'
import { isPotColor } from '@/features/ledger/core/types'
import { fluxiDb } from '@/lib/db'
import { and, asc, eq, gte, inArray, isNull, lte, ne, or, sql } from 'drizzle-orm'

/**
 * Read side of the ledger. Every query is scoped by `userId` (the session
 * user, resolved by the caller): there is no unscoped read in this module.
 */

export type MonthWindow = { from: Month; to: Month }

export type LedgerSnapshot = {
  banks: Bank[]
  accounts: Account[]
  categories: Category[]
  pots: Pot[]
  countFrom: Month | null
  entries: Entry[]
  parts: EntryPart[]
  overrides: EntryOverride[]
  payments: OccurrencePayment[]
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

/** Every pot of `userId`, archived ones included, in the user's order. */
export async function listPots(userId: string): Promise<Pot[]> {
  const rows = await db()
    .select()
    .from(pots)
    .where(eq(pots.userId, userId))
    .orderBy(asc(pots.sort), asc(pots.createdAt))
  return rows.map((r) => ({
    key: r.key,
    name: r.name,
    // The column is free text; an unknown color falls back to gray.
    color: isPotColor(r.color) ? r.color : 'slate',
    goal: r.goal === 'minimum' ? 'minimum' : 'limit',
    sort: r.sort,
    archived: r.archivedAt !== null,
  }))
}

/** Budget versions of `userId`, oldest first, each with its targets. */
export async function listBudgetPlans(userId: string): Promise<BudgetPlan[]> {
  const [planRows, targetRows] = await Promise.all([
    db()
      .select()
      .from(budgetPlans)
      .where(eq(budgetPlans.userId, userId))
      .orderBy(asc(budgetPlans.startsMonth)),
    db().select().from(budgetPlanTargets).where(eq(budgetPlanTargets.userId, userId)),
  ])
  return planRows.map((plan) => ({
    id: plan.id,
    startsMonth: monthFromDate(plan.startsMonth),
    targets: Object.fromEntries(
      targetRows.filter((t) => t.planId === plan.id).map((t) => [t.potKey, t.targetBps]),
    ),
  }))
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
    repeatEvery: r.repeatEvery,
    monthBy: r.monthBy,
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
    deleted: r.deleted,
  }))
}

/** Payments of `entryIds` for the window (plus the month before it, see {@link listEntries}). */
export async function listOccurrencePayments(
  userId: string,
  entryIds: readonly string[],
  window: MonthWindow,
): Promise<OccurrencePayment[]> {
  if (entryIds.length === 0) return []
  const rows = await db()
    .select()
    .from(occurrencePayments)
    .where(
      and(
        eq(occurrencePayments.userId, userId),
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

/** Everything the core needs to project `userId`'s ledger over `window`. */
export async function loadLedger(userId: string, window: MonthWindow): Promise<LedgerSnapshot> {
  const [bankRows, accountRows, categoryRows, potRows, countFrom, entryRows] = await Promise.all([
    listBanks(userId),
    listAccounts(userId),
    listCategories(userId),
    listPots(userId),
    getCountFrom(userId),
    listEntries(userId, window),
  ])
  const entryIds = entryRows.map((e) => e.id)
  const [parts, overrides, payments] = await Promise.all([
    listEntryParts(userId, entryIds),
    listEntryOverrides(userId, entryIds, window),
    listOccurrencePayments(userId, entryIds, window),
  ])
  return {
    banks: bankRows,
    accounts: accountRows,
    categories: categoryRows,
    pots: potRows,
    countFrom,
    entries: entryRows,
    parts,
    overrides,
    payments,
  }
}

/** Distinct tags across `userId`'s entries, sorted, for the form's tags autocomplete. */
export async function listTags(userId: string): Promise<string[]> {
  const rows = await db()
    .selectDistinct({ tag: sql<string>`unnest(${entries.tags})` })
    .from(entries)
    .where(eq(entries.userId, userId))
  return rows.map((r) => r.tag).sort((a, b) => a.localeCompare(b, 'pt-BR'))
}
