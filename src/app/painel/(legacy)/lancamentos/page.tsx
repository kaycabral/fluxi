import { PageHeader } from '@/app/painel/_components/page-header'
import { Unavailable } from '@/app/painel/_components/unavailable'
import { requirePainelUser, todayIso } from '@/app/painel/_lib/session'
import { Container } from '@/components/container'
import { loadCountFrom, loadLedgerData } from '@/features/ledger/adapters/views'
import { addMonths, monthRange } from '@/features/ledger/core/month'
import { parseSearchQuery } from '@/features/ledger/core/search'
import { SearchView } from '@/features/ledger/ui/search-view'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Lançamentos — Fluxi' }

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requirePainelUser()
  const today = todayIso().slice(0, 7)
  const countFrom = await loadCountFrom(user.id)
  const start = countFrom.ok && countFrom.data !== null ? countFrom.data : today
  const query = parseSearchQuery(await searchParams, start)
  const data = countFrom.ok
    ? await loadLedgerData(user.id, { from: query.from, to: query.to }, countFrom.data)
    : null
  const earliest = [start, today, query.from].sort()[0] ?? today
  const months = monthRange(addMonths(earliest, -24), addMonths(today, 36))

  return (
    <Container className="grid gap-4 px-4 py-5 md:px-6 md:py-8">
      <PageHeader title="Lançamentos" />
      {data?.ok === true ? (
        <SearchView data={data.data} query={query} start={start} months={months} />
      ) : (
        <Unavailable />
      )}
    </Container>
  )
}
