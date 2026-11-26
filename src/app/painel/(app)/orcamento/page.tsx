import { Unavailable } from '@/app/painel/_components/unavailable'
import { requirePainelScope, todayIso } from '@/app/painel/_lib/session'
import { loadBudgetPlans, loadCountFrom, loadLedgerData } from '@/features/ledger/adapters/views'
import { BudgetView } from '@/features/ledger/ui/budget-view'
import { Main } from '@cbrl/design'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Orçamento — Fluxi' }

/** Every month the database can hold: the traffic light walks any month without a round trip. */
const ALL_TIME = { from: '1900-01', to: '9999-12' }

/** `/painel/orcamento`: pots, budget versions and the monthly traffic light. */
export default async function BudgetPage() {
  const scope = await requirePainelScope()
  const countFrom = await loadCountFrom(scope)
  const [data, plans] = await Promise.all([
    loadLedgerData(scope, ALL_TIME, countFrom.ok ? countFrom.data : null),
    loadBudgetPlans(scope),
  ])

  return (
    <Main>
      {data.ok && plans.ok ? (
        <BudgetView data={data.data} plans={plans.data} today={todayIso().slice(0, 7)} />
      ) : (
        <Unavailable />
      )}
    </Main>
  )
}
