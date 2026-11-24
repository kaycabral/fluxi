import { Unavailable } from '@/app/painel/_components/unavailable'
import { requirePainelUser, todayIso } from '@/app/painel/_lib/session'
import { loadCountFrom, loadLedgerData } from '@/features/ledger/adapters/views'
import { monthSchema } from '@/features/ledger/core/schemas'
import { CalendarView } from '@/features/ledger/ui/calendar-view'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Calendário — Fluxi' }

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

/** `/painel`: the calendar is the main view of the app. */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requirePainelUser()
  const params = await searchParams
  const parsedMonth = monthSchema.safeParse(first(params.mes))
  const today = todayIso()
  const month = parsedMonth.success ? parsedMonth.data : today.slice(0, 7)
  const account = first(params.conta).slice(0, 80)
  const countFrom = await loadCountFrom(user.id)
  const data = countFrom.ok
    ? await loadLedgerData(user.id, { from: month, to: month }, countFrom.data)
    : null

  return (
    <main className="px-3 py-4 md:px-6 md:py-5">
      {data?.ok === true ? (
        <CalendarView data={data.data} month={month} account={account} today={today} />
      ) : (
        <Unavailable />
      )}
    </main>
  )
}
