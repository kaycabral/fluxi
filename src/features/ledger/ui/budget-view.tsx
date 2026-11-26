'use client'

import type { Month } from '@/features/ledger/core/month'
import type { BudgetVersion } from '@/features/ledger/core/types'
import type { LedgerData } from '@/features/ledger/core/view'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Typography } from '@cbrl/design'
import { BudgetGroupsCard } from './budget/groups-card'
import { TrafficLight, useBudgetMonth } from './budget/traffic-light'

/**
 * "Orçamento": the budget groups and their targets per budget version, and the monthly
 * traffic light (12 months, walked with arrows).
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
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <BudgetGroupsCard
          budgetGroups={data.budgetGroups}
          versions={versions}
          today={today}
          current={current}
        />
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle asChild>
              <h2>Semáforo mensal</h2>
            </CardTitle>
            <CardDescription>
              Planejado ÷ renda do mês, contra a versão do orçamento em vigor naquele mês. Passe o
              mouse num valor para ver a meta.
            </CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            <TrafficLight data={data} versions={versions} today={today} span={12} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
