'use server'

import {
  listAccounts,
  listBanks,
  listConnectedAccountIds,
} from '@/features/ledger/adapters/ledger.repo'
import {
  createAccount,
  createBank,
  renameAccount,
  setAccountArchived,
  updateAccount,
  updateBank,
  type WriteResult,
} from '@/features/ledger/adapters/ledger.write'
import { projectLedger } from '@/features/ledger/adapters/projection'
import {
  failureMessage,
  failureResult,
  formText,
  SESSION_EXPIRED,
  type ActionResult,
  type FormState,
} from '@/features/ledger/core/action-result'
import { accountBalancesOn } from '@/features/ledger/core/dashboard'
import { isoDayOf, parseSignedMoneyInput } from '@/features/ledger/core/format'
import {
  archiveAccountSchema,
  createAccountSchema,
  createBankSchema,
  firstIssue,
  renameAccountSchema,
  updateAccountSchema,
  updateBankSchema,
} from '@/features/ledger/core/schemas'
import type { AccountType, Bank } from '@/features/ledger/core/types'
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

/** One account as Configurações → Contas lists it. */
export type ManagedAccount = {
  id: string
  bankId: string
  name: string
  type: AccountType
  archived: boolean
  /** Balance at the end of today; 0 when archived (it counts nowhere, the list does not show it). */
  balanceCents: number
  /** A bank feed is mapped to it (archiving is refused until unmapped). */
  connected: boolean
}

export type AccountsData = { banks: Bank[]; accounts: ManagedAccount[] }

/** "Configurações → Contas" (loaded when the section opens): the current space's accounts. */
export async function loadAccountsAction(): Promise<
  { ok: true; data: AccountsData } | { ok: false; error: string }
> {
  const scope = await getServerScope()
  if (!scope) return { ok: false, error: SESSION_EXPIRED }
  const today = isoDayOf(new Date())
  const month = today.slice(0, 7)
  const [banks, list, connected, projection] = await Promise.all([
    listBanks(scope),
    listAccounts(scope),
    listConnectedAccountIds(scope),
    projectLedger(scope, { from: month, to: month }, today),
  ])
  const current = projection.months[0]
  const balances = current === undefined ? {} : accountBalancesOn(current, Number(today.slice(8)))
  return {
    ok: true,
    data: {
      banks,
      accounts: list.map((a) => ({
        id: a.id,
        bankId: a.bankId,
        name: a.name,
        type: a.type,
        archived: a.archived,
        balanceCents: a.archived ? 0 : (balances[a.id] ?? a.openingBalanceCents),
        connected: connected.includes(a.id),
      })),
    },
  }
}

function result(write: WriteResult): ActionResult {
  if (!write.ok) return failureResult(write.reason)
  revalidatePath('/painel', 'layout')
  return { ok: true }
}

/** Rename an account of the current space. */
export async function renameAccountAction(input: unknown): Promise<ActionResult> {
  const scope = await getServerScope()
  if (!scope) return { ok: false, error: SESSION_EXPIRED }
  const parsed = renameAccountSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  return result(await renameAccount(scope, parsed.data))
}

/** Archive or unarchive an account of the current space (a connected one is refused). */
export async function setAccountArchivedAction(input: unknown): Promise<ActionResult> {
  const scope = await getServerScope()
  if (!scope) return { ok: false, error: SESSION_EXPIRED }
  const parsed = archiveAccountSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  return result(await setAccountArchived(scope, parsed.data))
}
