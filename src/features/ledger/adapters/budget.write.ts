import 'server-only'

import { budgetPlans, budgetPlanTargets, categories, entries, pots } from '@/db/schema'
import { newPotKey } from '@/features/ledger/core/budget'
import { monthToDate } from '@/features/ledger/core/month'
import type {
  BudgetPlanInput,
  CreatePotInput,
  UpdatePotInput,
} from '@/features/ledger/core/schemas'
import type { PotKey } from '@/features/ledger/core/types'
import { isUniqueViolation } from '@cbrl/pg'
import { and, count, eq, sql } from 'drizzle-orm'
import { randomInt } from 'node:crypto'
import { db, fail, guarded, ok, type WriteResult } from './write-base'

/**
 * Write side of the budget: pots (created, renamed, recolored, archived) and
 * its versions (plans). Every function takes the session `userId` and scopes
 * by it; composite foreign keys refuse a pot of another user.
 */

/** Create a pot at the end of the list; it starts at 0% in every version. */
export async function createPot(
  userId: string,
  input: CreatePotInput,
): Promise<WriteResult & { key?: PotKey }> {
  const key = newPotKey(() => randomInt(0, 1_000_000) / 1_000_000)
  await db()
    .insert(pots)
    .values({
      userId,
      key,
      name: input.name,
      color: input.color,
      sort: sql`(select coalesce(max(${pots.sort}) + 1, 0) from ${pots} where ${pots.userId} = ${userId})`,
    })
  return { ok: true, key }
}

/** Rename, recolor, change the goal of, or restore a pot. */
export async function updatePot(userId: string, input: UpdatePotInput): Promise<WriteResult> {
  const rows = await db()
    .update(pots)
    .set({
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.color === undefined ? {} : { color: input.color }),
      ...(input.goal === undefined ? {} : { goal: input.goal }),
      ...(input.archived === false ? { archivedAt: null } : {}),
      updatedAt: sql`now()`,
    })
    .where(and(eq(pots.userId, userId), eq(pots.key, input.key)))
    .returning({ key: pots.key })
  return rows.length === 0 ? fail('not_found') : ok
}

export type RemovePotResult =
  { ok: true; outcome: 'deleted' | 'archived' } | { ok: false; reason: 'not_found' }

/**
 * Remove a pot. One that entries or categories still point at is archived
 * (leaves the pickers, keeps its history and targets); an unused one is
 * deleted with its targets.
 */
export async function removePot(userId: string, key: PotKey): Promise<RemovePotResult> {
  return db().transaction(async (tx) => {
    const [pot] = await tx
      .select({ key: pots.key })
      .from(pots)
      .where(and(eq(pots.userId, userId), eq(pots.key, key)))
      .for('update')
    if (pot === undefined) return { ok: false, reason: 'not_found' }
    const [usedByEntries] = await tx
      .select({ n: count() })
      .from(entries)
      .where(and(eq(entries.userId, userId), eq(entries.pot, key)))
    const [usedByCategories] = await tx
      .select({ n: count() })
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.defaultPot, key)))
    if ((usedByEntries?.n ?? 0) > 0 || (usedByCategories?.n ?? 0) > 0) {
      await tx
        .update(pots)
        .set({ archivedAt: sql`coalesce(${pots.archivedAt}, now())`, updatedAt: sql`now()` })
        .where(and(eq(pots.userId, userId), eq(pots.key, key)))
      return { ok: true, outcome: 'archived' }
    }
    await tx.delete(pots).where(and(eq(pots.userId, userId), eq(pots.key, key)))
    return { ok: true, outcome: 'deleted' }
  })
}

/**
 * Create a budget version (`id` null) or edit one: its start month and the
 * whole set of targets (pots left out are 0%). Refused past 100% or when
 * another version already starts in that month.
 */
export async function saveBudgetPlan(
  userId: string,
  input: BudgetPlanInput,
): Promise<WriteResult & { id?: string }> {
  const total = Object.values(input.targets).reduce((sum, bps) => sum + bps, 0)
  if (total > 10000) return fail('over_budget')
  try {
    return await guarded(() =>
      db().transaction(async (tx) => {
        const startsMonth = monthToDate(input.startsMonth)
        let planId = input.id
        if (planId === null) {
          const [created] = await tx
            .insert(budgetPlans)
            .values({ userId, startsMonth })
            .returning({ id: budgetPlans.id })
          if (created === undefined) return fail('not_found')
          planId = created.id
        } else {
          const updated = await tx
            .update(budgetPlans)
            .set({ startsMonth, updatedAt: sql`now()` })
            .where(and(eq(budgetPlans.userId, userId), eq(budgetPlans.id, planId)))
            .returning({ id: budgetPlans.id })
          if (updated.length === 0) return fail('not_found')
          await tx
            .delete(budgetPlanTargets)
            .where(and(eq(budgetPlanTargets.userId, userId), eq(budgetPlanTargets.planId, planId)))
        }
        const rows = Object.entries(input.targets)
          .filter(([, bps]) => bps > 0)
          .map(([potKey, targetBps]) => ({ planId, userId, potKey, targetBps }))
        if (rows.length > 0) await tx.insert(budgetPlanTargets).values(rows)
        return { ok: true, id: planId }
      }),
    )
  } catch (error) {
    if (isUniqueViolation(error)) return fail('duplicate_plan')
    throw error
  }
}

/** Delete a budget version; the last one stays (the budget always has a version). */
export async function deleteBudgetPlan(userId: string, planId: string): Promise<WriteResult> {
  return db().transaction(async (tx) => {
    const plans = await tx
      .select({ id: budgetPlans.id })
      .from(budgetPlans)
      .where(eq(budgetPlans.userId, userId))
      .for('update')
    if (!plans.some((p) => p.id === planId)) return fail('not_found')
    if (plans.length <= 1) return fail('last_plan')
    await tx
      .delete(budgetPlans)
      .where(and(eq(budgetPlans.userId, userId), eq(budgetPlans.id, planId)))
    return ok
  })
}
