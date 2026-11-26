import 'server-only'

import { budgetGroups, categories, entries } from '@/db/schema'
import { categorizationRules } from '@/db/schema-bank-feed'
import {
  matchesKey,
  ruleRange,
  similarityKey,
  type CategorizationRule,
  type SimilarResult,
} from '@/features/ledger/core/similar'
import { and, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm'
import { bankMerchant, isFromBank } from './ledger.repo'
import { inScope, owned, type Scope } from './scope-filter'
import { db, fail, guarded, ok, ScopeError, type Tx, type WriteResult } from './write-base'

/**
 * "Categorize once, replicate": the user-owned fields (category, budget group) of
 * several entries at once, the bank entries that look like one, and the
 * categorization rules the materialization applies to new bank entries.
 * Every statement is scoped; amounts, dates and accounts are never written,
 * so the bank lock holds for any mix of bank and manual entries.
 */

export type { CategorizationRule, SimilarResult }

const MAX_CANDIDATES = 200

/** `YYYY-MM-DD` of a one-off entry. */
const dateOf = (startMonth: string, day: number) =>
  `${startMonth.slice(0, 8)}${String(day).padStart(2, '0')}`

/**
 * Bank one-off entries of the space with the same {@link similarityKey} as
 * `entryId` (its merchant when the bank gave one, else its description) (itself excluded), newest first. Null when the entry is not the
 * scope's.
 */
export async function findSimilarBankEntries(
  scope: Scope,
  entryId: string,
): Promise<SimilarResult | null> {
  const [found] = await db()
    .select({ entry: entries, merchantName: bankMerchant })
    .from(entries)
    .where(and(eq(entries.id, entryId), inScope(entries, scope)))
  if (found === undefined) return null
  const { entry: source, merchantName } = found
  const key = similarityKey({ description: source.description, merchantName })
  const reference = {
    id: source.id,
    amountCents: source.amountCents,
    description: source.description,
    merchantName,
    by: key.by,
  }
  if (key.key === '') return { reference, candidates: [] }
  const rows = await db()
    .select({ entry: entries, merchantName: bankMerchant })
    .from(entries)
    .where(
      and(
        inScope(entries, scope),
        ne(entries.id, entryId),
        ne(entries.kind, 'transfer'),
        eq(entries.recurrence, 'none'),
        sql`${isFromBank}`,
      ),
    )
    .orderBy(desc(entries.startMonth), desc(entries.day))
  const candidates = rows
    .filter((r) =>
      matchesKey(key, { description: r.entry.description, merchantName: r.merchantName }),
    )
    .slice(0, MAX_CANDIDATES)
    .map(({ entry: r, merchantName: merchant }) => ({
      id: r.id,
      description: r.description,
      merchantName: merchant,
      date: dateOf(r.startMonth, r.day),
      accountId: r.accountId,
      amountCents: r.amountCents,
      categoryId: r.categoryId,
      budgetGroup: r.budgetGroup,
    }))
  return { reference, candidates }
}

export type CategorizeInput = {
  entryIds: readonly string[]
  /** Undefined = keep; null = clear. */
  categoryId?: string | null
  budgetGroup?: string | null
  ruleFromEntryId?: string
}

/** The category and budget group exist in the scope and are not archived. */
async function assertTargets(tx: Tx, scope: Scope, input: CategorizeInput): Promise<void> {
  if (input.categoryId) {
    const [category] = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.id, input.categoryId),
          inScope(categories, scope),
          isNull(categories.archivedAt),
        ),
      )
    if (category === undefined) throw new ScopeError('invalid_reference')
  }
  if (input.budgetGroup) {
    const [budgetGroup] = await tx
      .select({ key: budgetGroups.key })
      .from(budgetGroups)
      .where(
        and(
          eq(budgetGroups.key, input.budgetGroup),
          inScope(budgetGroups, scope),
          isNull(budgetGroups.archivedAt),
        ),
      )
    if (budgetGroup === undefined) throw new ScopeError('invalid_reference')
  }
}

async function recordRule(
  tx: Tx,
  scope: Scope,
  input: CategorizeInput & { ruleFromEntryId: string },
  amounts: readonly number[],
): Promise<void> {
  const [source] = await tx
    .select({
      description: entries.description,
      amountCents: entries.amountCents,
      merchantName: bankMerchant,
    })
    .from(entries)
    .where(and(eq(entries.id, input.ruleFromEntryId), inScope(entries, scope)))
  if (source === undefined) throw new ScopeError('not_found')
  const { by, key } = similarityKey(source)
  const value = key.slice(0, 200)
  const categoryId = input.categoryId ?? null
  const budgetGroup = input.budgetGroup ?? null
  if (value === '' || (categoryId === null && budgetGroup === null)) return
  await tx.insert(categorizationRules).values({
    ...owned(scope),
    ...(by === 'merchant' ? { merchantKey: value } : { pattern: value }),
    ...ruleRange([source.amountCents, ...amounts]),
    categoryId,
    budgetGroup,
  })
}

/**
 * Sets category and/or budget group on the scope's `entryIds` (transfers never get
 * either, incomes never a budget group). With `ruleFromEntryId`, also records a rule:
 * that entry's `similarityKey` (merchant, else description), the range of the absolute amounts of
 * it and of the entries, its category and budget group as given.
 */
export function categorizeEntries(scope: Scope, input: CategorizeInput): Promise<WriteResult> {
  return guarded(() =>
    db().transaction(async (tx) => {
      await assertTargets(tx, scope, input)
      const ids = [...new Set(input.entryIds)]
      const found = await tx
        .select({ id: entries.id, kind: entries.kind, amountCents: entries.amountCents })
        .from(entries)
        .where(and(inArray(entries.id, ids), inScope(entries, scope)))
      if (found.length !== ids.length) throw new ScopeError('not_found')

      const notTransfer = found.filter((e) => e.kind !== 'transfer').map((e) => e.id)
      const expenses = found.filter((e) => e.kind === 'expense').map((e) => e.id)
      if (input.categoryId !== undefined && notTransfer.length > 0) {
        await tx
          .update(entries)
          .set({ categoryId: input.categoryId, updatedAt: sql`now()` })
          .where(and(inArray(entries.id, notTransfer), inScope(entries, scope)))
      }
      if (input.budgetGroup !== undefined && expenses.length > 0) {
        await tx
          .update(entries)
          .set({ budgetGroup: input.budgetGroup, updatedAt: sql`now()` })
          .where(and(inArray(entries.id, expenses), inScope(entries, scope)))
      }
      const { ruleFromEntryId } = input
      if (ruleFromEntryId !== undefined) {
        await recordRule(
          tx,
          scope,
          { ...input, ruleFromEntryId },
          found.map((e) => e.amountCents),
        )
      }
      return ok
    }),
  )
}

/** The space's rules, newest first, with the names of their category and budget group. */
export async function listRules(scope: Scope): Promise<CategorizationRule[]> {
  const rows = await db()
    .select({
      rule: categorizationRules,
      categoryName: categories.name,
      budgetGroupName: budgetGroups.name,
    })
    .from(categorizationRules)
    .leftJoin(
      categories,
      and(
        eq(categories.id, categorizationRules.categoryId),
        eq(categories.spaceId, categorizationRules.spaceId),
      ),
    )
    .leftJoin(
      budgetGroups,
      and(
        eq(budgetGroups.key, categorizationRules.budgetGroup),
        eq(budgetGroups.spaceId, categorizationRules.spaceId),
      ),
    )
    .where(inScope(categorizationRules, scope))
    .orderBy(desc(categorizationRules.createdAt))
  return rows.map(({ rule, categoryName, budgetGroupName }) => ({
    id: rule.id,
    pattern: rule.pattern,
    merchantKey: rule.merchantKey,
    minCents: rule.minCents,
    maxCents: rule.maxCents,
    categoryId: rule.categoryId,
    categoryName,
    budgetGroup: rule.budgetGroup,
    budgetGroupName,
  }))
}

export async function deleteRule(scope: Scope, id: string): Promise<WriteResult> {
  const removed = await db()
    .delete(categorizationRules)
    .where(and(eq(categorizationRules.id, id), inScope(categorizationRules, scope)))
    .returning({ id: categorizationRules.id })
  return removed.length === 0 ? fail('not_found') : ok
}
