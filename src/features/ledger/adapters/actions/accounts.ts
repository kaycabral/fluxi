'use server'

import {
  createAccount,
  createBank,
  updateAccount,
  updateBank,
  type WriteResult,
} from '@/features/ledger/adapters/ledger.write'
import {
  failureMessage,
  formText,
  SESSION_EXPIRED,
  type FormState,
} from '@/features/ledger/core/action-result'
import { parseSignedMoneyInput } from '@/features/ledger/core/format'
import {
  createAccountSchema,
  createBankSchema,
  firstIssue,
  updateAccountSchema,
  updateBankSchema,
} from '@/features/ledger/core/schemas'
import { getServerScope } from '@/features/spaces/adapters/scope'
import { revalidatePath } from 'next/cache'
import type { z } from 'zod'

/**
 * Banks and accounts, as `<form action>` handlers for `useActionState`: they
 * work before hydration (progressive enhancement). The `intent` field picks
 * create vs update; ids for creates are minted on the server render, so a
 * resubmitted form is a no-op.
 */

function failed(error: string): FormState {
  return { ok: false, error, savedAt: 0 }
}

function finish(result: WriteResult): FormState {
  if (!result.ok) return failed(failureMessage(result.reason))
  revalidatePath('/painel', 'layout')
  return { ok: true, error: null, savedAt: Date.now() }
}

function parse<T extends z.ZodType>(
  schema: T,
  value: unknown,
): { data: z.infer<T> } | { error: string } {
  const parsed = schema.safeParse(value)
  return parsed.success ? { data: parsed.data } : { error: firstIssue(parsed.error) }
}

export async function saveBankAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const scope = await getServerScope()
  if (!scope) return failed(SESSION_EXPIRED)
  const input = { id: formText(formData, 'id'), name: formText(formData, 'name') }
  const isCreate = formText(formData, 'intent') === 'create'
  const parsed = parse(isCreate ? createBankSchema : updateBankSchema, input)
  if ('error' in parsed) return failed(parsed.error)
  return finish(
    isCreate ? await createBank(scope, parsed.data) : await updateBank(scope, parsed.data),
  )
}

export async function saveAccountAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const scope = await getServerScope()
  if (!scope) return failed(SESSION_EXPIRED)
  const opening = parseSignedMoneyInput(formText(formData, 'openingBalance') || '0')
  if (opening === null) return failed('Saldo inicial inválido.')
  const common = {
    id: formText(formData, 'id'),
    name: formText(formData, 'name'),
    type: formText(formData, 'type'),
    openingBalanceCents: opening,
  }
  if (formText(formData, 'intent') === 'create') {
    const parsed = parse(createAccountSchema, { ...common, bankId: formText(formData, 'bankId') })
    if ('error' in parsed) return failed(parsed.error)
    return finish(await createAccount(scope, parsed.data))
  }
  const parsed = parse(updateAccountSchema, {
    ...common,
    archived: formText(formData, 'active') !== 'on',
  })
  if ('error' in parsed) return failed(parsed.error)
  return finish(await updateAccount(scope, parsed.data))
}
