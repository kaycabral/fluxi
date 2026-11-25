import { Unavailable } from '@/app/painel/_components/unavailable'
import { requirePainelUser, todayIso } from '@/app/painel/_lib/session'
import { loadLedgerData } from '@/features/ledger/adapters/views'
import { parseSearchQuery, SEARCH_QUERY_COOKIE } from '@/features/ledger/core/search'
import { SearchView } from '@/features/ledger/ui/search-view'
import { Main } from '@cbrl/design'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'

export const metadata: Metadata = { title: 'Lançamentos — Fluxi' }

/** Every month the database can hold: the list shows the whole ledger. */
const ALL_TIME = { from: '1900-01', to: '9999-12' }

/**
 * `/painel/lancamentos`: every occurrence of the ledger, newest first. The
 * whole ledger comes once; search and filters run on the client, starting
 * from the query this browser left (cookie).
 */
export default async function SearchPage() {
  const user = await requirePainelUser()
  const query = parseSearchQuery((await cookies()).get(SEARCH_QUERY_COOKIE)?.value)
  const data = await loadLedgerData(user.id, ALL_TIME, null)

  return (
    <Main>
      {data.ok ? (
        <SearchView data={data.data} initialQuery={query} today={todayIso()} />
      ) : (
        <Unavailable />
      )}
    </Main>
  )
}
