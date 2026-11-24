import type { Landing } from './occurrence'
import type { Account, AccountType } from './types'

/**
 * Money buckets. Benefit accounts (meal/food vouchers, culture and home-office
 * allowances) hold money the user cannot freely spend or withdraw, so every
 * decision view (balances, results, the lowest balance, "A pagar", pots) works
 * on the AVAILABLE bucket only; benefits are shown apart and never summed into
 * the available balance. A transfer between the buckets is an outflow of one
 * and an inflow of the other.
 */
export type MoneyBucket = 'available' | 'benefit'

export function bucketOfType(type: AccountType): MoneyBucket {
  return type === 'benefit' ? 'benefit' : 'available'
}

type Typed = Pick<Account, 'id' | 'type'>

/** Bucket of an account id; unknown ids count as available. */
export function bucketOfAccount(accountId: string, accounts: readonly Typed[]): MoneyBucket {
  const account = accounts.find((a) => a.id === accountId)
  return account === undefined ? 'available' : bucketOfType(account.type)
}

/** Ids of the accounts in `bucket`, in input order. */
export function accountIdsInBucket<A extends Typed>(
  accounts: readonly A[],
  bucket: MoneyBucket,
): string[] {
  return accounts.filter((a) => bucketOfType(a.type) === bucket).map((a) => a.id)
}

/** Whether a landing moves money in an account of `bucket`. */
export function landingTouchesBucket(
  landing: Landing,
  bucket: MoneyBucket,
  accounts: readonly Typed[],
): boolean {
  const { accountId, toAccountId } = landing.entry
  return (
    bucketOfAccount(accountId, accounts) === bucket ||
    (toAccountId !== null && bucketOfAccount(toAccountId, accounts) === bucket)
  )
}
