import type { Account, AccountType } from './types'

/**
 * Money buckets: benefit accounts (meal/food vouchers, culture and home-office
 * allowances) versus the money spent or withdrawn freely. Only a filter
 * ("Dinheiro" in the entries list); every view counts all accounts.
 */
export type MoneyBucket = 'available' | 'benefit'

export function bucketOfType(type: AccountType): MoneyBucket {
  return type === 'benefit' ? 'benefit' : 'available'
}

type Typed = Pick<Account, 'id' | 'type'>

/** Ids of the accounts in `bucket`, in input order. */
export function accountIdsInBucket<A extends Typed>(
  accounts: readonly A[],
  bucket: MoneyBucket,
): string[] {
  return accounts.filter((a) => bucketOfType(a.type) === bucket).map((a) => a.id)
}
