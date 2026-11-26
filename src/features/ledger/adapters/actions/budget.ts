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
import { getServerScope } from '@/features/spaces/adapters/scope'
import type { Scope } from '@/features/spaces/core/space'
import { revalidatePath } from 'next/cache'
import type { z } from 'zod'

/**
 * Budget actions called from the "Potes da renda" card: inline pot CRUD and
 * the budget versions. Inputs are re-validated here; `scope` always comes
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
  write: (scope: Scope, data: z.infer<T>) => Promise<ActionResult>,
): Promise<ActionResult> {
  const scope = await getServerScope()
  if (!scope) return { ok: false, error: SESSION_EXPIRED }
  const parsed = schema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  return write(scope, parsed.data)
}

export async function createPotAction(input: unknown): Promise<ActionResult> {
  return run(createPotSchema, input, async (scope, data) => done(await createPot(scope, data)))
}

export async function updatePotAction(input: unknown): Promise<ActionResult> {
  return run(updatePotSchema, input, async (scope, data) => done(await updatePot(scope, data)))
}

/** `archived: true` when the pot had history and was archived instead of deleted. */
export async function removePotAction(
  input: unknown,
): Promise<ActionResult & { archived?: boolean }> {
  const scope = await getServerScope()
  if (!scope) return { ok: false, error: SESSION_EXPIRED }
  const parsed = potKeySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const result = await removePot(scope, parsed.data)
  if (!result.ok) return failureResult(result.reason)
  revalidatePath('/painel', 'layout')
  return { ok: true, archived: result.outcome === 'archived' }
}

export async function saveBudgetPlanAction(input: unknown): Promise<ActionResult> {
  return run(budgetPlanSchema, input, async (scope, data) =>
    done(await saveBudgetPlan(scope, data)),
  )
}

export async function deleteBudgetPlanAction(input: unknown): Promise<ActionResult> {
  return run(idSchema, input, async (scope, id) => done(await deleteBudgetPlan(scope, id)))
}
