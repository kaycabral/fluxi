'use server'

import { markOccurrencePaid, unmarkOccurrencePaid } from '@/features/ledger/adapters/payments.write'
import type { WriteResult } from '@/features/ledger/adapters/write-base'
import {
  failureResult,
  SESSION_EXPIRED,
  type ActionResult,
} from '@/features/ledger/core/action-result'
import { isoDayOf } from '@/features/ledger/core/format'
import { firstIssue, markPaidSchema, paymentKeySchema } from '@/features/ledger/core/schemas'
import { getServerScope } from '@/features/spaces/adapters/scope'
import { revalidatePath } from 'next/cache'

/**
 * "Pago/recebido" writes. Inputs are `unknown` (public POST endpoints), the
 * user always comes from the session, and both are idempotent. The default
 * paid date is today in America/Sao_Paulo (there is no per-user time zone yet).
 */

function done(result: WriteResult): ActionResult {
  if (!result.ok) return failureResult(result.reason)
  revalidatePath('/painel', 'layout')
  return result.undo === undefined ? { ok: true } : { ok: true, undo: result.undo }
}

export async function markPaidAction(input: unknown): Promise<ActionResult> {
  const scope = await getServerScope()
  if (!scope) return { ok: false, error: SESSION_EXPIRED }
  const parsed = markPaidSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const { paidOn, ...key } = parsed.data
  return done(await markOccurrencePaid(scope, { ...key, paidOn: paidOn ?? isoDayOf(new Date()) }))
}

export async function unmarkPaidAction(input: unknown): Promise<ActionResult> {
  const scope = await getServerScope()
  if (!scope) return { ok: false, error: SESSION_EXPIRED }
  const parsed = paymentKeySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  return done(await unmarkOccurrencePaid(scope, parsed.data))
}
