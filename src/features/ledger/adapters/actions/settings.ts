'use server'

import { setCountFrom, setPotTargets } from '@/features/ledger/adapters/ledger.write'
import {
  failureMessage,
  formText,
  SESSION_EXPIRED,
  type FormState,
} from '@/features/ledger/core/action-result'
import { countFromSchema, firstIssue, potTargetsSchema } from '@/features/ledger/core/schemas'
import { POT_KEYS } from '@/features/ledger/core/types'
import { getServerUser } from '@/lib/auth/server'
import { revalidatePath } from 'next/cache'

/** Per-user settings as `<form action>` handlers (`useActionState`). */

function failed(error: string): FormState {
  return { ok: false, error, savedAt: 0 }
}

function saved(): FormState {
  revalidatePath('/painel', 'layout')
  return { ok: true, error: null, savedAt: Date.now() }
}

export async function setCountFromAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await getServerUser()
  if (!user) return failed(SESSION_EXPIRED)
  const parsed = countFromSchema.safeParse({ month: formText(formData, 'month') })
  if (!parsed.success) return failed(firstIssue(parsed.error))
  await setCountFrom(user.id, parsed.data.month)
  return saved()
}

/** Targets arrive in basis points, one field per pot; the sum is re-checked here and in the adapter. */
export async function setPotTargetsAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await getServerUser()
  if (!user) return failed(SESSION_EXPIRED)
  const raw = Object.fromEntries(
    POT_KEYS.map((key) => [key, Number(formText(formData, key) || Number.NaN)]),
  )
  const parsed = potTargetsSchema.safeParse(raw)
  if (!parsed.success) return failed(firstIssue(parsed.error))
  const result = await setPotTargets(user.id, parsed.data)
  if (!result.ok) return failed(failureMessage(result.reason))
  return saved()
}
