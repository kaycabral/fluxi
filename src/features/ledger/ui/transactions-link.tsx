import { searchParamsOf, type SearchQuery } from '@/features/ledger/core/search'
import type { Route } from 'next'
import Link from 'next/link'
import type { ComponentProps } from 'react'

/** Where "Transações" lives. */
export const TRANSACTIONS_PATH = '/painel/transacoes' satisfies Route

/** "Transações" filtered by `query` (the query lives in the URL). */
export function transactionsHref(query: SearchQuery): Route {
  const search = searchParamsOf(query)
  return search === '' ? TRANSACTIONS_PATH : `${TRANSACTIONS_PATH}?${search}`
}

/** A link that opens "Transações" already filtered by `query`. */
export function TransactionsLink({
  query,
  ...props
}: { query: SearchQuery } & Omit<ComponentProps<typeof Link>, 'href'>) {
  return <Link href={transactionsHref(query)} {...props} />
}
