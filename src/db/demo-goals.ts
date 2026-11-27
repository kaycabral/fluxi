import { addMonths, monthToDate, type Month } from '@/features/ledger/core/month'
import type { Scope } from '@/features/spaces/core/space'
import { and, desc, eq } from 'drizzle-orm'
import type { FluxiDb } from './db'
import { budgetGroupTargets, budgetVersions } from './schema'
import { goals } from './schema-goals'

/**
 * Demo goals for the LOCAL dev user: one per kind, so "Objetivos" opens alive.
 * Gives "Metas" 10% of the latest budget version (taken from "Conforto") when
 * it has none. Callers seed only while the user has no goals. Local dev only.
 */
export async function seedDemoGoals(db: FluxiDb, scope: Scope, start: Month): Promise<void> {
  const owner = { userId: scope.userId, spaceId: scope.spaceId }
  const [version] = await db
    .select({ id: budgetVersions.id })
    .from(budgetVersions)
    .where(eq(budgetVersions.spaceId, scope.spaceId))
    .orderBy(desc(budgetVersions.startsMonth))
    .limit(1)
  if (version !== undefined) await shareForMetas(db, version.id, owner)

  const startMonth = monthToDate(start)
  const goal = { ...owner, startMonth, withdrawalBps: 400 }
  await db.insert(goals).values([
    {
      ...goal,
      name: 'Reserva de emergência',
      kind: 'emergency',
      budgetGroup: 'investment',
      monthlyCents: 150_000,
      initialCents: 2_000_000,
      sort: 0,
    },
    {
      ...goal,
      name: 'Independência financeira',
      kind: 'independence',
      budgetGroup: 'investment',
      initialCents: 8_000_000,
      sort: 1,
    },
    {
      ...goal,
      name: 'Viagem anual',
      kind: 'recurring',
      budgetGroup: 'goals',
      targetCents: 1_200_000,
      targetMonth: monthToDate(addMonths(start, 5)),
      monthlyCents: 120_000,
      initialCents: 400_000,
      sort: 2,
    },
    {
      ...goal,
      name: 'Carro',
      kind: 'purchase',
      budgetGroup: 'goals',
      targetCents: 9_000_000,
      targetMonth: monthToDate(addMonths(start, 36)),
      monthlyCents: 100_000,
      initialCents: 1_500_000,
      sort: 3,
    },
  ])
}

async function shareForMetas(
  db: FluxiDb,
  versionId: string,
  owner: { userId: string; spaceId: string },
): Promise<void> {
  const targets = await db
    .select()
    .from(budgetGroupTargets)
    .where(eq(budgetGroupTargets.versionId, versionId))
  const comfort = targets.find((t) => t.budgetGroup === 'comfort')
  if (targets.some((t) => t.budgetGroup === 'goals') || comfort === undefined) return
  if (comfort.targetBps < 1000) return
  await db
    .update(budgetGroupTargets)
    .set({ targetBps: comfort.targetBps - 1000 })
    .where(
      and(
        eq(budgetGroupTargets.versionId, versionId),
        eq(budgetGroupTargets.budgetGroup, 'comfort'),
      ),
    )
  await db
    .insert(budgetGroupTargets)
    .values({ versionId, ...owner, budgetGroup: 'goals', targetBps: 1000 })
}
