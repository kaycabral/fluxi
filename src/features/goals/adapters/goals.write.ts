import 'server-only'

import { goals } from '@/db/schema-goals'
import type { GoalInput } from '@/features/goals/core/schemas'
import { inScope, owned, type Scope } from '@/features/ledger/adapters/scope-filter'
import { db, fail, guarded, ok, type WriteResult } from '@/features/ledger/adapters/write-base'
import { monthToDate } from '@/features/ledger/core/month'
import { and, eq, sql } from 'drizzle-orm'

/**
 * Write side of the goals. Composite foreign keys refuse a budget group or an
 * account of another space (`invalid_reference`).
 */

function columns(input: GoalInput) {
  return {
    name: input.name,
    kind: input.kind,
    budgetGroup: input.budgetGroup,
    targetCents: input.targetCents,
    targetMonth: input.targetMonth === null ? null : monthToDate(input.targetMonth),
    monthlyCents: input.monthlyCents,
    initialCents: input.initialCents,
    withdrawalBps: input.withdrawalBps,
    accountId: input.accountId,
  }
}

/** Create (`id` null; the envelope starts in `currentMonth`) or edit a goal. */
export async function saveGoal(
  scope: Scope,
  input: GoalInput,
  currentMonth: string,
): Promise<WriteResult> {
  return guarded(async () => {
    if (input.id === null) {
      await db()
        .insert(goals)
        .values({
          ...owned(scope),
          ...columns(input),
          startMonth: monthToDate(currentMonth),
          sort: sql`(select coalesce(max(${goals.sort}) + 1, 0) from ${goals} where ${goals.spaceId} = ${scope.spaceId})`,
        })
      return ok
    }
    const rows = await db()
      .update(goals)
      .set({ ...columns(input), updatedAt: sql`now()` })
      .where(and(inScope(goals, scope), eq(goals.id, input.id)))
      .returning({ id: goals.id })
    return rows.length === 0 ? fail('not_found') : ok
  })
}

export async function deleteGoal(scope: Scope, id: string): Promise<WriteResult> {
  const rows = await db()
    .delete(goals)
    .where(and(inScope(goals, scope), eq(goals.id, id)))
    .returning({ id: goals.id })
  return rows.length === 0 ? fail('not_found') : ok
}
