'use server'

import { forgetUndo, undoLastAction } from '@/features/ledger/adapters/undo.write'
import {
  failureResult,
  SESSION_EXPIRED,
  type ActionResult,
} from '@/features/ledger/core/action-result'
import { firstIssue, undoSchema } from '@/features/ledger/core/schemas'
import { getServerUser } from '@/lib/auth/server'
import { revalidatePath } from 'next/cache'

/**
 * "Desfazer" (toast button, Z or Ctrl+Z). Inputs are `unknown` (public POST
 * endpoints); the token only ever reaches the session user's own record.
 */

export async function undoAction(input: unknown): Promise<ActionResult> {
  const user = await getServerUser()
  if (!user) return { ok: false, error: SESSION_EXPIRED }
  const parsed = undoSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const result = await undoLastAction(user.id, parsed.data.token)
  if (!result.ok) return failureResult(result.reason)
  revalidatePath('/painel', 'layout')
  return { ok: true }
}

/** The toast closed without "Desfazer": drop the record now instead of at its expiry. */
export async function forgetUndoAction(input: unknown): Promise<void> {
  const user = await getServerUser()
  const parsed = undoSchema.safeParse(input)
  if (!user || !parsed.success) return
  await forgetUndo(user.id, parsed.data.token)
}
