'use server'

import {
  changeOccurrenceDay,
  createEntry,
  deleteEntry,
  updateEntry,
  type WriteResult,
} from '@/features/ledger/adapters/ledger.write'
import {
  failureResult,
  SESSION_EXPIRED,
  type ActionResult,
} from '@/features/ledger/core/action-result'
import {
  changeDaySchema,
  createEntrySchema,
  deleteEntrySchema,
  firstIssue,
  updateEntrySchema,
} from '@/features/ledger/core/schemas'
import { getServerUser } from '@/lib/auth/server'
import { revalidatePath } from 'next/cache'

/**
 * Entry writes. Inputs are `unknown` on purpose: a server action is a public
 * POST endpoint, so everything is re-validated here and the user always comes
 * from the session, never from the payload.
 */

function done(result: WriteResult): ActionResult {
  if (!result.ok) return failureResult(result.reason)
  revalidatePath('/painel', 'layout')
  return { ok: true }
}

export async function createEntryAction(input: unknown): Promise<ActionResult> {
  const user = await getServerUser()
  if (!user) return { ok: false, error: SESSION_EXPIRED }
  const parsed = createEntrySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  return done(await createEntry(user.id, parsed.data.id, parsed.data.fields))
}

export async function updateEntryAction(input: unknown): Promise<ActionResult> {
  const user = await getServerUser()
  if (!user) return { ok: false, error: SESSION_EXPIRED }
  const parsed = updateEntrySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const { entryId, month, scope, fields } = parsed.data
  return done(await updateEntry(user.id, entryId, fields, month === null ? null : { month, scope }))
}

export async function deleteEntryAction(input: unknown): Promise<ActionResult> {
  const user = await getServerUser()
  if (!user) return { ok: false, error: SESSION_EXPIRED }
  const parsed = deleteEntrySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const { entryId, month, scope } = parsed.data
  return done(await deleteEntry(user.id, entryId, month === null ? null : { month, scope }))
}

export async function changeDayAction(input: unknown): Promise<ActionResult> {
  const user = await getServerUser()
  if (!user) return { ok: false, error: SESSION_EXPIRED }
  const parsed = changeDaySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  return done(await changeOccurrenceDay(user.id, parsed.data))
}
