import { Unavailable } from '@/app/painel/_components/unavailable'
import { requirePainelScope, todayIso } from '@/app/painel/_lib/session'
import { loadLedgerData } from '@/features/ledger/adapters/views'
import { SearchView } from '@/features/ledger/ui/search-view'
import { Main } from '@cbrl/design'
import type { Metadata } from 'next'
import { connection } from 'next/server'

export const metadata: Metadata = { title: 'Transações — Fluxi' }

/** Every month the database can hold: the list shows the whole ledger. */
const ALL_TIME = { from: '1900-01', to: '9999-12' }

/**
 * `/painel/transacoes`: every occurrence of the ledger, oldest first. The
 * whole ledger comes once; search and filters run on the client, from the
 * query in the URL (`SEARCH_PARAMS`), so the server never depends on them.
 */
export default async function SearchPage() {
  await connection()
  const scope = await requirePainelScope()
  const data = await loadLedgerData(scope, ALL_TIME, todayIso())

  return (
    <Main>{data.ok ? <SearchView data={data.data} today={todayIso()} /> : <Unavailable />}</Main>
  )
}
