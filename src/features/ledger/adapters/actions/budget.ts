'use server'

import {
  createPot,
  deleteBudgetPlan,
  removePot,
  saveBudgetPlan,
  updatePot,
} from '@/features/ledger/adapters/budget.write'
import type { WriteResult } from '@/features/ledger/adapters/write-base'
import {
  failureResult,
  SESSION_EXPIRED,
  type ActionResult,
} from '@/features/ledger/core/action-result'
import {
  budgetPlanSchema,
  createPotSchema,
  firstIssue,
  idSchema,
  potKeySchema,
  updatePotSchema,
} from '@/features/ledger/core/schemas'
import { getServerUser } from '@/lib/auth/server'
import { revalidatePath } from 'next/cache'
import type { z } from 'zod'

/**
 * Budget actions called from the "Potes da renda" card: inline pot CRUD and
 * the budget versions. Inputs are re-validated here; `userId` always comes
 * from the session.
 */

function done(result: WriteResult): ActionResult {
  if (!result.ok) return failureResult(result.reason)
  revalidatePath('/painel', 'layout')
  return { ok: true }
}

async function run<T extends z.ZodType>(
  schema: T,
  input: unknown,
  write: (userId: string, data: z.infer<T>) => Promise<ActionResult>,
): Promise<ActionResult> {
  const user = await getServerUser()
  if (!user) return { ok: false, error: SESSION_EXPIRED }
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  return write(user.id, parsed.data)
}

export async function createPotAction(input: unknown): Promise<ActionResult> {
  return run(createPotSchema, input, async (userId, data) => done(await createPot(userId, data)))
}

export async function updatePotAction(input: unknown): Promise<ActionResult> {
  return run(updatePotSchema, input, async (userId, data) => done(await updatePot(userId, data)))
}

/** `archived: true` when the pot had history and was archived instead of deleted. */
export async function removePotAction(
  input: unknown,
): Promise<ActionResult & { archived?: boolean }> {
  const user = await getServerUser()
  if (!user) return { ok: false, error: SESSION_EXPIRED }
  const parsed = potKeySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const result = await removePot(user.id, parsed.data)
  if (!result.ok) return failureResult(result.reason)
  revalidatePath('/painel', 'layout')
  return { ok: true, archived: result.outcome === 'archived' }
}

export async function saveBudgetPlanAction(input: unknown): Promise<ActionResult> {
  return run(budgetPlanSchema, input, async (userId, data) =>
    done(await saveBudgetPlan(userId, data)),
  )
}

export async function deleteBudgetPlanAction(input: unknown): Promise<ActionResult> {
  return run(idSchema, input, async (userId, id) => done(await deleteBudgetPlan(userId, id)))
}
