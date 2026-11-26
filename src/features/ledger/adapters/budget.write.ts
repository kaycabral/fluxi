import 'server-only'

import { budgetGroups, budgetGroupTargets, budgetVersions, categories, entries } from '@/db/schema'
import { newBudgetGroupKey } from '@/features/ledger/core/budget'
import { monthToDate } from '@/features/ledger/core/month'
import type {
  BudgetVersionInput,
  CreateBudgetGroupInput,
  UpdateBudgetGroupInput,
} from '@/features/ledger/core/schemas'
import type { BudgetGroupKey } from '@/features/ledger/core/types'
import { isUniqueViolation } from '@cbrl/pg'
import { and, count, eq, sql } from 'drizzle-orm'
import { randomInt } from 'node:crypto'
import { inScope, owned, type Scope } from './scope-filter'
import { db, fail, guarded, ok, type WriteResult } from './write-base'

/**
 * Write side of the budget: budget groups (created, renamed, recolored, archived) and
 * its versions. Every function takes the session `scope` (user + active
 * space) and filters by it; composite foreign keys refuse a budget group of another space.
 */

/** Create a budget group at the end of the list; it starts at 0% in every version. */
export async function createBudgetGroup(
  scope: Scope,
  input: CreateBudgetGroupInput,
): Promise<WriteResult & { key?: BudgetGroupKey }> {
  const key = newBudgetGroupKey(() => randomInt(0, 1_000_000) / 1_000_000)
  await db()
    .insert(budgetGroups)
    .values({
      ...owned(scope),
      key,
      name: input.name,
      color: input.color,
      sort: sql`(select coalesce(max(${budgetGroups.sort}) + 1, 0) from ${budgetGroups} where ${budgetGroups.spaceId} = ${scope.spaceId})`,
    })
  return { ok: true, key }
}

/** Rename, recolor, change the goal of, or restore a budget group. */
export async function updateBudgetGroup(
  scope: Scope,
  input: UpdateBudgetGroupInput,
): Promise<WriteResult> {
  const rows = await db()
    .update(budgetGroups)
    .set({
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.color === undefined ? {} : { color: input.color }),
      ...(input.goal === undefined ? {} : { goal: input.goal }),
      ...(input.archived === false ? { archivedAt: null } : {}),
      updatedAt: sql`now()`,
    })
    .where(and(inScope(budgetGroups, scope), eq(budgetGroups.key, input.key)))
    .returning({ key: budgetGroups.key })
  return rows.length === 0 ? fail('not_found') : ok
}

export type RemoveBudgetGroupResult =
  { ok: true; outcome: 'deleted' | 'archived' } | { ok: false; reason: 'not_found' }

/**
 * Remove a budget group. One that entries or categories still point at is archived
 * (leaves the pickers, keeps its history and targets); an unused one is
 * deleted with its targets.
 */
export async function removeBudgetGroup(
  scope: Scope,
  key: BudgetGroupKey,
): Promise<RemoveBudgetGroupResult> {
  return db().transaction(async (tx) => {
    const [budgetGroup] = await tx
      .select({ key: budgetGroups.key })
      .from(budgetGroups)
      .where(and(inScope(budgetGroups, scope), eq(budgetGroups.key, key)))
      .for('update')
    if (budgetGroup === undefined) return { ok: false, reason: 'not_found' }
    const [usedByEntries] = await tx
      .select({ n: count() })
      .from(entries)
      .where(and(inScope(entries, scope), eq(entries.budgetGroup, key)))
    const [usedByCategories] = await tx
      .select({ n: count() })
      .from(categories)
      .where(and(inScope(categories, scope), eq(categories.defaultBudgetGroup, key)))
    if ((usedByEntries?.n ?? 0) > 0 || (usedByCategories?.n ?? 0) > 0) {
      await tx
        .update(budgetGroups)
        .set({
          archivedAt: sql`coalesce(${budgetGroups.archivedAt}, now())`,
          updatedAt: sql`now()`,
        })
        .where(and(inScope(budgetGroups, scope), eq(budgetGroups.key, key)))
      return { ok: true, outcome: 'archived' }
    }
    await tx
      .delete(budgetGroups)
      .where(and(inScope(budgetGroups, scope), eq(budgetGroups.key, key)))
    return { ok: true, outcome: 'deleted' }
  })
}

/**
 * Create a budget version (`id` null) or edit one: its start month and the
 * whole set of targets (budget groups left out are 0%). Refused past 100% or when
 * another version already starts in that month.
 */
export async function saveBudgetVersion(
  scope: Scope,
  input: BudgetVersionInput,
): Promise<WriteResult & { id?: string }> {
  const total = Object.values(input.targets).reduce((sum, bps) => sum + bps, 0)
  if (total > 10000) return fail('over_budget')
  try {
    return await guarded(() =>
      db().transaction(async (tx) => {
        const startsMonth = monthToDate(input.startsMonth)
        let versionId = input.id
        if (versionId === null) {
          const [created] = await tx
            .insert(budgetVersions)
            .values({ ...owned(scope), startsMonth })
            .returning({ id: budgetVersions.id })
          if (created === undefined) return fail('not_found')
          versionId = created.id
        } else {
          const updated = await tx
            .update(budgetVersions)
            .set({ startsMonth, updatedAt: sql`now()` })
            .where(and(inScope(budgetVersions, scope), eq(budgetVersions.id, versionId)))
            .returning({ id: budgetVersions.id })
          if (updated.length === 0) return fail('not_found')
          await tx
            .delete(budgetGroupTargets)
            .where(
              and(inScope(budgetGroupTargets, scope), eq(budgetGroupTargets.versionId, versionId)),
            )
        }
        const rows = Object.entries(input.targets)
          .filter(([, bps]) => bps > 0)
          .map(([budgetGroup, targetBps]) => ({
            versionId,
            ...owned(scope),
            budgetGroup,
            targetBps,
          }))
        if (rows.length > 0) await tx.insert(budgetGroupTargets).values(rows)
        return { ok: true, id: versionId }
      }),
    )
  } catch (error) {
    if (isUniqueViolation(error)) return fail('duplicate_version')
    throw error
  }
}

/** Delete a budget version; the last one stays (the budget always has a version). */
export async function deleteBudgetVersion(scope: Scope, versionId: string): Promise<WriteResult> {
  return db().transaction(async (tx) => {
    const versions = await tx
      .select({ id: budgetVersions.id })
      .from(budgetVersions)
      .where(inScope(budgetVersions, scope))
      .for('update')
    if (!versions.some((p) => p.id === versionId)) return fail('not_found')
    if (versions.length <= 1) return fail('last_version')
    await tx
      .delete(budgetVersions)
      .where(and(inScope(budgetVersions, scope), eq(budgetVersions.id, versionId)))
    return ok
  })
}
