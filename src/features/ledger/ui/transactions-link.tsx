'use client'

import {
  parseSearchQuery,
  SEARCH_QUERY_COOKIE,
  serializeSearchQuery,
  type SearchQuery,
} from '@/features/ledger/core/search'
import { readBrowserCookie, writeBrowserCookie } from '@/lib/browser-cookie'
import Link from 'next/link'
import { useEffectEvent, useLayoutEffect, type ComponentProps } from 'react'

/** Where "Transações" lives; its query cookie is scoped to this path. */
export const TRANSACTIONS_PATH = '/painel/transacoes'

/** Remember the query of "Transações" in this browser (read back by the server on the next visit). */
export function rememberSearchQuery(query: SearchQuery) {
  writeBrowserCookie(SEARCH_QUERY_COOKIE, serializeSearchQuery(query), { path: TRANSACTIONS_PATH })
}

/** The query of "Transações" this browser remembers (`null` without cookie). */
export function rememberedSearchQuery(): SearchQuery | null {
  const raw = readBrowserCookie(SEARCH_QUERY_COOKIE)
  return raw === undefined ? null : parseSearchQuery(raw)
}

/**
 * Cache Components keeps "Transações" hidden (Activity) instead of unmounting
 * it, so coming back keeps the old query. Effects re-run each time the page
 * shows again: adopt the query a `TransactionsLink` just wrote, if different.
 */
export function useRememberedQuery(current: SearchQuery, adopt: (query: SearchQuery) => void) {
  const sync = useEffectEvent(() => {
    const remembered = rememberedSearchQuery()
    if (remembered === null) return
    if (serializeSearchQuery(remembered) !== serializeSearchQuery(current)) adopt(remembered)
  })
  useLayoutEffect(() => sync(), [])
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
