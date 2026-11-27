'use server'

import { deleteGoal, saveGoal } from '@/features/goals/adapters/goals.write'
import { goalInputSchema } from '@/features/goals/core/schemas'
import type { WriteResult } from '@/features/ledger/adapters/write-base'
import {
  failureResult,
  SESSION_EXPIRED,
  type ActionResult,
} from '@/features/ledger/core/action-result'
import { isoDayOf } from '@/features/ledger/core/format'
import { monthFromDate } from '@/features/ledger/core/month'
import { firstIssue, idSchema } from '@/features/ledger/core/schemas'
import { getServerScope } from '@/features/spaces/adapters/scope'
import { revalidatePath } from 'next/cache'

/** Goal actions of `/painel/objetivos`. Inputs are re-validated; the scope comes from the session. */

function done(result: WriteResult): ActionResult {
  if (!result.ok) return failureResult(result.reason)
  revalidatePath('/painel', 'layout')
  return { ok: true }
}

export async function saveGoalAction(input: unknown): Promise<ActionResult> {
  const scope = await getServerScope()
  if (!scope) return { ok: false, error: SESSION_EXPIRED }
  const parsed = goalInputSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  return done(await saveGoal(scope, parsed.data, monthFromDate(isoDayOf(new Date()))))
}

export async function deleteGoalAction(id: unknown): Promise<ActionResult> {
  const scope = await getServerScope()
  if (!scope) return { ok: false, error: SESSION_EXPIRED }
  const parsed = idSchema.safeParse(id)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  return done(await deleteGoal(scope, parsed.data))
}
