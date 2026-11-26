'use server'

import { setCountFrom } from '@/features/ledger/adapters/ledger.write'
import { formText, SESSION_EXPIRED, type FormState } from '@/features/ledger/core/action-result'
import { countFromSchema, firstIssue } from '@/features/ledger/core/schemas'
import { getServerScope } from '@/features/spaces/adapters/scope'
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
  const scope = await getServerScope()
  if (!scope) return failed(SESSION_EXPIRED)
  const parsed = countFromSchema.safeParse({ month: formText(formData, 'month') })
  if (!parsed.success) return failed(firstIssue(parsed.error))
  await setCountFrom(scope, parsed.data.month)
  return saved()
}
