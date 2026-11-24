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
import { getServerUser } from '@/lib/auth/server'
import { revalidatePath } from 'next/cache'

/**
 * "Pago/recebido" writes. Inputs are `unknown` (public POST endpoints), the
 * user always comes from the session, and both are idempotent. The default
 * paid date is today in America/Sao_Paulo (there is no per-user time zone yet).
 */

function done(result: WriteResult): ActionResult {
  if (!result.ok) return failureResult(result.reason)
  revalidatePath('/painel', 'layout')
  return { ok: true }
}

export async function markPaidAction(input: unknown): Promise<ActionResult> {
  const user = await getServerUser()
  if (!user) return { ok: false, error: SESSION_EXPIRED }
  const parsed = markPaidSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const { paidOn, ...key } = parsed.data
  return done(await markOccurrencePaid(user.id, { ...key, paidOn: paidOn ?? isoDayOf(new Date()) }))
}

export async function unmarkPaidAction(input: unknown): Promise<ActionResult> {
  const user = await getServerUser()
  if (!user) return { ok: false, error: SESSION_EXPIRED }
  const parsed = paymentKeySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  return done(await unmarkOccurrencePaid(user.id, parsed.data))
}
