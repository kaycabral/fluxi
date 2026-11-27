'use client'

import {
  SEARCH_QUERY_COOKIE,
  serializeSearchQuery,
  type SearchQuery,
} from '@/features/ledger/core/search'
import { writeBrowserCookie } from '@/lib/browser-cookie'
import Link from 'next/link'
import type { ComponentProps } from 'react'

/** Where "Transações" lives; its query cookie is scoped to this path. */
export const TRANSACTIONS_PATH = '/painel/transacoes'

/** Remember the query of "Transações" in this browser (read back by the server on the next visit). */
export function rememberSearchQuery(query: SearchQuery) {
  writeBrowserCookie(SEARCH_QUERY_COOKIE, serializeSearchQuery(query), { path: TRANSACTIONS_PATH })
}

/**
 * A link that opens "Transações" already filtered by `query`: it writes the
 * query cookie before navigating (the page renders from it). Never
 * prefetched, so the page is rendered with the new cookie.
 */
export function TransactionsLink({
  query,
  onClick,
  ...props
}: { query: SearchQuery } & Omit<ComponentProps<typeof Link>, 'href' | 'prefetch'>) {
  return (
    <Link
      href={TRANSACTIONS_PATH}
      prefetch={false}
      onClick={(event) => {
        rememberSearchQuery(query)
        onClick?.(event)
      }}
      {...props}
    />
  )
}
