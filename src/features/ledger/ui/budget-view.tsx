'use client'

import type { Month } from '@/features/ledger/core/month'
import type { BudgetVersion } from '@/features/ledger/core/types'
import type { LedgerData } from '@/features/ledger/core/view'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Typography } from '@cbrl/design'
import { BudgetGroupsCard } from './budget/groups-card'
import { BUDGET_WINDOW, TrafficLight, useBudgetMonth } from './budget/traffic-light'

/**
 * "Orçamento": the monthly traffic light, full width and with the dashboard
 * widget's window and presentation (previous, current and the next 3 months,
 * walked with arrows; each cell explains itself on hover), above the budget
 * groups and their targets per budget version.
 */
export function BudgetView({
  data,
  versions,
  today,
}: {
  data: LedgerData
  versions: readonly BudgetVersion[]
  /** Current month. */
  today: Month
}) {
  const current = useBudgetMonth(data, versions, today)

  return (
    <div className="grid gap-4">
      <Typography variant="pageTitle" as="h1">
        Orçamento
      </Typography>
      <div className="grid gap-4">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle asChild>
              <h2>Semáforo mensal</h2>
            </CardTitle>
            <CardDescription>
              Planejado ÷ renda do mês, contra a versão do orçamento em vigor naquele mês. Passe o
              mouse num valor para ver a meta e a situação.
            </CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            <TrafficLight
              data={data}
              versions={versions}
              today={today}
              span={BUDGET_WINDOW.span}
              before={BUDGET_WINDOW.before}
            />
          </CardContent>
        </Card>
        <BudgetGroupsCard
          budgetGroups={data.budgetGroups}
          versions={versions}
          today={today}
          current={current}
        />
      </div>
    </div>
  )
}
