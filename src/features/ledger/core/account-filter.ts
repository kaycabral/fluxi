import { accountIdsInBucket } from './bucket'
import type { Account, Bank, Entry } from './types'

/**
 * Account filter used by the timeline, the search and the calendar: empty for
 * every account, `b:<bankId>` for all accounts of a bank, or an account id.
 */
export type AccountFilter = string

const BANK_PREFIX = 'b:'

export function bankFilter(bankId: string): AccountFilter {
  return `${BANK_PREFIX}${bankId}`
}

export function bankIdOf(filter: AccountFilter): string | null {
  return filter.startsWith(BANK_PREFIX) ? filter.slice(BANK_PREFIX.length) : null
}

/** Accounts the filter covers; null means "all accounts" (no restriction). */
export function accountIdsOf(
  filter: AccountFilter,
  accounts: readonly Pick<Account, 'id' | 'bankId'>[],
): string[] | null {
  if (filter === '') return null
  const bankId = bankIdOf(filter)
  if (bankId !== null) return accounts.filter((a) => a.bankId === bankId).map((a) => a.id)
  return [filter]
}

/**
 * Accounts a DECISION view (day by day, calendar) covers: "all" means every
 * available account (benefits are never mixed in); a bank means its available
 * accounts, or all of them when it only holds benefits; an account id is
 * itself, a benefit account included.
 */
export function decisionAccountIds(
  filter: AccountFilter,
  accounts: readonly Pick<Account, 'id' | 'bankId' | 'type'>[],
): string[] {
  if (filter === '') return accountIdsInBucket(accounts, 'available')
  const bankId = bankIdOf(filter)
  if (bankId === null) return [filter]
  const own = accounts.filter((a) => a.bankId === bankId)
  const available = accountIdsInBucket(own, 'available')
  return available.length > 0 ? available : own.map((a) => a.id)
}

/** Whether an entry moves money in any account the filter covers. */
export function entryMatchesAccounts(
  entry: Pick<Entry, 'accountId' | 'toAccountId'>,
  ids: readonly string[] | null,
): boolean {
  if (ids === null) return true
  return (
    ids.includes(entry.accountId) || (entry.toAccountId !== null && ids.includes(entry.toAccountId))
  )
}

/** `Banco · Conta`, or `–` for an unknown id. */
export function accountLabel(
  accountId: string | null,
  accounts: readonly Pick<Account, 'id' | 'bankId' | 'name'>[],
  banks: readonly Pick<Bank, 'id' | 'name'>[],
): string {
  const account = accounts.find((a) => a.id === accountId)
  if (account === undefined) return '–'
  const bank = banks.find((b) => b.id === account.bankId)
  return bank === undefined ? account.name : `${bank.name} · ${account.name}`
}

/** Human label of a filter (`Nubank (todas)`, `BTG · Conta`, `Todas as contas`). */
export function filterLabel(
  filter: AccountFilter,
  accounts: readonly Pick<Account, 'id' | 'bankId' | 'name'>[],
  banks: readonly Pick<Bank, 'id' | 'name'>[],
): string {
  if (filter === '') return 'Todas as contas'
  const bankId = bankIdOf(filter)
  if (bankId !== null) return banks.find((b) => b.id === bankId)?.name ?? '–'
  return accountLabel(filter, accounts, banks)
}
