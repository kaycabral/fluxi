import { Unavailable } from '@/app/painel/_components/unavailable'
import { requirePainelScope, todayIso } from '@/app/painel/_lib/session'
import { loadBudgetPlans, loadLedgerData } from '@/features/ledger/adapters/views'
import { DashboardView } from '@/features/ledger/ui/dashboard/dashboard-view'
import { Main } from '@cbrl/design'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = { title: 'Painel — Fluxi' }

/** Every month the database can hold: the traffic light walks any month without a round trip. */
const ALL_TIME = { from: '1900-01', to: '9999-12' }

/** Query params of the calendar when it lived at `/painel`. */
const CALENDAR_PARAMS = ['modo', 'data', 'mes', 'conta']

/**
 * `/painel`: the dashboard. Old calendar links (`/painel?modo=…`) go on to
 * `/painel/calendario` with their params.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const calendar = new URLSearchParams()
  for (const key of CALENDAR_PARAMS) {
    const value = params[key]
    const first = Array.isArray(value) ? value[0] : value
    if (first !== undefined) calendar.set(key, first)
  }
  if (calendar.size > 0) redirect(`/painel/calendario?${calendar.toString()}`)

  const scope = await requirePainelScope()
  const [data, plans] = await Promise.all([
    loadLedgerData(scope, ALL_TIME, todayIso()),
    loadBudgetPlans(scope),
  ])

  return (
    <Main>
      {data.ok && plans.ok ? (
        <DashboardView data={data.data} plans={plans.data} today={todayIso()} />
      ) : (
        <Unavailable />
      )}
    </Main>
  )
}
