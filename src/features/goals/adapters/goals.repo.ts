import 'server-only'

import { goals } from '@/db/schema-goals'
import { isGoalKind, type Goal } from '@/features/goals/core/goals'
import { inScope, type Scope } from '@/features/ledger/adapters/scope-filter'
import { monthFromDate } from '@/features/ledger/core/month'
import { fluxiDb } from '@/lib/db'
import { readBackend, type BackendRead } from '@cbrl/next/server'
import { asc } from 'drizzle-orm'

/** The space's goals, in the user's order. */
export async function listGoals(scope: Scope): Promise<Goal[]> {
  const rows = await fluxiDb
    .db()
    .select()
    .from(goals)
    .where(inScope(goals, scope))
    .orderBy(asc(goals.sort), asc(goals.createdAt))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: isGoalKind(r.kind) ? r.kind : 'purchase',
    budgetGroup: r.budgetGroup,
    targetCents: r.targetCents,
    targetMonth: r.targetMonth === null ? null : monthFromDate(r.targetMonth),
    monthlyCents: r.monthlyCents,
    initialCents: r.initialCents,
    withdrawalBps: r.withdrawalBps,
    accountId: r.accountId,
    startMonth: monthFromDate(r.startMonth),
    sort: r.sort,
  }))
}

export function loadGoals(scope: Scope): Promise<BackendRead<Goal[]>> {
  return readBackend(() => listGoals(scope), { label: 'goals' })
}
