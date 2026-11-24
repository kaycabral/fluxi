import { PageHeader } from '@/app/painel/_components/page-header'
import { Unavailable } from '@/app/painel/_components/unavailable'
import { requirePainelUser, todayIso } from '@/app/painel/_lib/session'
import { Container } from '@/components/container'
import { loadCountFrom, loadLedgerData } from '@/features/ledger/adapters/views'
import { monthSchema } from '@/features/ledger/core/schemas'
import { CalendarView } from '@/features/ledger/ui/calendar-view'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Calendário — Fluxi' }

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requirePainelUser()
  const params = await searchParams
  const parsedMonth = monthSchema.safeParse(first(params.mes))
  const month = parsedMonth.success ? parsedMonth.data : todayIso().slice(0, 7)
  const account = first(params.conta).slice(0, 80)
  const countFrom = await loadCountFrom(user.id)
  const data = countFrom.ok
    ? await loadLedgerData(user.id, { from: month, to: month }, countFrom.data)
    : null

  return (
    <Container className="grid gap-4 px-4 py-5 md:px-6 md:py-8">
      <PageHeader title="Calendário" />
      {data?.ok === true ? (
        <CalendarView data={data.data} month={month} account={account} />
      ) : (
        <Unavailable />
      )}
    </Container>
  )
}
