import { Unavailable } from '@/app/painel/_components/unavailable'
import { requirePainelScope, todayIso } from '@/app/painel/_lib/session'
import {
  loadBankHealth,
  loadBudgetVersions,
  loadConnectedBanks,
  loadLedgerData,
} from '@/features/ledger/adapters/views'
import { DashboardView } from '@/features/ledger/ui/dashboard/dashboard-view'
import { Main } from '@cbrl/design'
import type { Metadata } from 'next'
import { connection } from 'next/server'

export const metadata: Metadata = { title: 'Painel — Fluxi' }

/** Every month the database can hold: the traffic light walks any month without a round trip. */
const ALL_TIME = { from: '1900-01', to: '9999-12' }

/**
 * `/painel`: the dashboard. Old calendar links (`/painel?modo=…`) go on to
 * `/painel/calendario` by a `next.config` redirect.
 */
export default async function DashboardPage() {
  await connection()
  const scope = await requirePainelScope()
  const [data, versions, connected, health] = await Promise.all([
    loadLedgerData(scope, ALL_TIME, todayIso()),
    loadBudgetVersions(scope),
    loadConnectedBanks(scope),
    loadBankHealth(scope, new Date()),
  ])

  return (
    <Main>
      {data.ok && versions.ok ? (
        <DashboardView
          data={data.data}
          versions={versions.data}
          today={todayIso()}
          // Optional extra: the dashboard still renders without it.
          connectedBanks={connected.ok ? connected.data : []}
          bankHealth={health.ok ? health.data : {}}
        />
      ) : (
        <Unavailable />
      )}
    </Main>
  )
}
