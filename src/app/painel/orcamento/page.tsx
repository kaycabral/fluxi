import { PageHeader } from '@/app/painel/_components/page-header'
import { Unavailable } from '@/app/painel/_components/unavailable'
import { requirePainelUser, todayIso } from '@/app/painel/_lib/session'
import { Container } from '@/components/container'
import { loadBudgetData, loadCountFrom } from '@/features/ledger/adapters/views'
import { BudgetView } from '@/features/ledger/ui/budget-view'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Orçamento — Fluxi' }

export default async function BudgetPage() {
  const user = await requirePainelUser()
  const today = todayIso().slice(0, 7)
  const countFrom = await loadCountFrom(user.id)
  const start = countFrom.ok && countFrom.data !== null ? countFrom.data : today
  const budget = countFrom.ok ? await loadBudgetData(user.id, start) : null

  return (
    <Container className="grid gap-4 px-4 py-5 md:px-6 md:py-8">
      <PageHeader title="Orçamento" />
      {budget?.ok === true ? (
        <BudgetView pots={budget.data.pots} months={budget.data.months} />
      ) : (
        <Unavailable />
      )}
    </Container>
  )
}
