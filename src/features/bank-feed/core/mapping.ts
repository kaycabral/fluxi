import type { AccountType } from '@/features/ledger/core/types'
import { z } from 'zod'

/**
 * Mapping a bank feed account (Pluggy) onto a Fluxi account, as the user does
 * it in Configurações → Conexões. A credit-card feed account is ONE card
 * account in Pluggy even when several physical/virtual cards share its limit:
 * every card's transactions arrive on it, so it maps to one credit account.
 */

/** Fluxi account types a feed account of `feedType` may be mapped to. */
export function compatibleTypes(feedType: string): readonly AccountType[] {
  return feedType === 'CREDIT' ? ['credit'] : ['checking', 'investment', 'benefit']
}

/** Type of the account "Criar conta" makes for a feed account. */
export function createdTypeFor(feedType: string): AccountType {
  return feedType === 'CREDIT' ? 'credit' : 'checking'
}

/** The feed's balance as the ledger holds it: a card's open bill is debt (negative). */
export function ledgerBalanceOf(feedType: string, balanceCents: number): number {
  return feedType === 'CREDIT' ? -balanceCents : balanceCents
}

export const mapFeedAccountSchema = z.object({
  feedAccountId: z.uuid('Conta do banco inválida.'),
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('account'), accountId: z.uuid('Conta inválida.') }),
    z.object({ kind: z.literal('create') }),
    z.object({ kind: z.literal('none') }),
  ]),
})
export type MapFeedAccountInput = z.infer<typeof mapFeedAccountSchema>
