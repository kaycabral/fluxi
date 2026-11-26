'use server'

import {
  categorizeEntries,
  deleteRule,
  findSimilarBankEntries,
  listRules,
  type CategorizationRule,
  type SimilarResult,
} from '@/features/ledger/adapters/categorize.write'
import {
  failureResult,
  SESSION_EXPIRED,
  type ActionResult,
} from '@/features/ledger/core/action-result'
import {
  categorizeEntriesSchema,
  deleteRuleSchema,
  firstIssue,
  similarEntriesSchema,
} from '@/features/ledger/core/schemas'
import { getServerScope } from '@/features/spaces/adapters/scope'
import { revalidatePath } from 'next/cache'

/**
 * "Categorize once, replicate". Inputs are `unknown` (public POST endpoints):
 * re-validated here, scope always from the session.
 */

export type Read<T> = { ok: true; data: T } | { ok: false; error: string }

/** Bank entries that look like `entryId` (same normalized description). */
export async function findSimilarAction(input: unknown): Promise<Read<SimilarResult>> {
  const scope = await getServerScope()
  if (!scope) return { ok: false, error: SESSION_EXPIRED }
  const parsed = similarEntriesSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const found = await findSimilarBankEntries(scope, parsed.data.entryId)
  return found === null
    ? { ok: false, error: 'Transação não encontrada.' }
    : { ok: true, data: found }
}

/** Category and/or budget group on several entries (optionally recording a rule). */
export async function categorizeEntriesAction(input: unknown): Promise<ActionResult> {
  const scope = await getServerScope()
  if (!scope) return { ok: false, error: SESSION_EXPIRED }
  const parsed = categorizeEntriesSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const result = await categorizeEntries(scope, parsed.data)
  if (!result.ok) return failureResult(result.reason)
  revalidatePath('/painel', 'layout')
  return { ok: true }
}

export async function loadRulesAction(): Promise<Read<CategorizationRule[]>> {
  const scope = await getServerScope()
  if (!scope) return { ok: false, error: SESSION_EXPIRED }
  return { ok: true, data: await listRules(scope) }
}

export async function deleteRuleAction(input: unknown): Promise<ActionResult> {
  const scope = await getServerScope()
  if (!scope) return { ok: false, error: SESSION_EXPIRED }
  const parsed = deleteRuleSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const result = await deleteRule(scope, parsed.data.id)
  return result.ok ? { ok: true } : failureResult(result.reason)
}
