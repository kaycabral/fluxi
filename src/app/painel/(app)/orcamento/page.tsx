import { Unavailable } from '@/app/painel/_components/unavailable'
import { requirePainelScope, todayIso } from '@/app/painel/_lib/session'
import { loadBudgetVersions, loadLedgerData } from '@/features/ledger/adapters/views'
import { BudgetView } from '@/features/ledger/ui/budget-view'
import { Main } from '@cbrl/design'
import type { Metadata } from 'next'
import { connection } from 'next/server'

export const metadata: Metadata = { title: 'Orçamento — Fluxi' }

/** Every month the database can hold: the traffic light walks any month without a round trip. */
const ALL_TIME = { from: '1900-01', to: '9999-12' }

/** `/painel/orcamento`: budget groups, budget versions and the monthly traffic light. */
export default async function BudgetPage() {
  await connection()
  const scope = await requirePainelScope()
  const [data, versions] = await Promise.all([
    loadLedgerData(scope, ALL_TIME, todayIso()),
    loadBudgetVersions(scope),
  ])

  return (
    <Main>
      {data.ok && versions.ok ? (
        <BudgetView data={data.data} versions={versions.data} today={todayIso().slice(0, 7)} />
      ) : (
        <Unavailable />
      )}
    </Main>
  )
}
