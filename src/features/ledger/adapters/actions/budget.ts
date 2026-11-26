'use server'

import {
  createBudgetGroup,
  deleteBudgetVersion,
  removeBudgetGroup,
  saveBudgetVersion,
  updateBudgetGroup,
} from '@/features/ledger/adapters/budget.write'
import type { WriteResult } from '@/features/ledger/adapters/write-base'
import {
  failureResult,
  SESSION_EXPIRED,
  type ActionResult,
} from '@/features/ledger/core/action-result'
import {
  budgetGroupKeySchema,
  budgetVersionSchema,
  createBudgetGroupSchema,
  firstIssue,
  idSchema,
  updateBudgetGroupSchema,
} from '@/features/ledger/core/schemas'
import { getServerScope } from '@/features/spaces/adapters/scope'
import type { Scope } from '@/features/spaces/core/space'
import { revalidatePath } from 'next/cache'
import type { z } from 'zod'

/**
 * Budget actions called from the "Grupos do orçamento" card: inline budget group CRUD and
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

export async function createBudgetGroupAction(input: unknown): Promise<ActionResult> {
  return run(createBudgetGroupSchema, input, async (scope, data) =>
    done(await createBudgetGroup(scope, data)),
  )
}

export async function updateBudgetGroupAction(input: unknown): Promise<ActionResult> {
  return run(updateBudgetGroupSchema, input, async (scope, data) =>
    done(await updateBudgetGroup(scope, data)),
  )
}

/** `archived: true` when the budget group had history and was archived instead of deleted. */
export async function removeBudgetGroupAction(
  input: unknown,
): Promise<ActionResult & { archived?: boolean }> {
  const scope = await getServerScope()
  if (!scope) return { ok: false, error: SESSION_EXPIRED }
  const parsed = budgetGroupKeySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const result = await removeBudgetGroup(scope, parsed.data)
  if (!result.ok) return failureResult(result.reason)
  revalidatePath('/painel', 'layout')
  return { ok: true, archived: result.outcome === 'archived' }
}

export async function saveBudgetVersionAction(input: unknown): Promise<ActionResult> {
  return run(budgetVersionSchema, input, async (scope, data) =>
    done(await saveBudgetVersion(scope, data)),
  )
}

export async function deleteBudgetVersionAction(input: unknown): Promise<ActionResult> {
  return run(idSchema, input, async (scope, id) => done(await deleteBudgetVersion(scope, id)))
}
