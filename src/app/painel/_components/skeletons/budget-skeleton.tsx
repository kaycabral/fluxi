'use client'

import {
  ButtonSkeleton,
  TextSkeleton,
  TrafficLightSkeleton,
  useSkeletonGroups,
} from '@/app/painel/_components/skeletons/parts'
import { GROUP_DOT_CLASSES } from '@/features/ledger/core/labels'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cn,
  Main,
  Skeleton,
  Typography,
} from '@cbrl/design'
import { MoreHorizontal } from 'lucide-react'

/** The budget page's traffic light window (`BUDGET_WINDOW`). */
const WINDOW = { span: 5, before: 0 }

/** "Grupos do orçamento" loading: the groups with their names, the targets blank. */
function GroupsCardSkeleton() {
  const groups = useSkeletonGroups()
  return (
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h2>Grupos do orçamento</h2>
        </CardTitle>
        <CardDescription>
          Cada grupo recebe uma fatia da renda do mês. A soma não passa de 100%.
        </CardDescription>
        <CardAction className="flex items-center gap-1">
          <Skeleton className="h-8 w-[167px]" />
          <span className="text-muted-foreground grid size-7 place-items-center [&_svg]:size-4">
            <MoreHorizontal />
          </span>
        </CardAction>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-muted-foreground text-xs">
            <TextSkeleton sample="Versão em vigor de dez/26 em diante" />
          </div>
          <Skeleton className="h-5 w-[118px] rounded-4xl" />
        </div>
        <Skeleton className="h-3 rounded-full" />
        <ul className="grid gap-3">
          {groups.map(({ key, group, hintClass }) => (
            <li key={key} className={cn('grid gap-1', hintClass)}>
              <div className="grid grid-cols-[minmax(0,8rem)_1fr_3.25rem_2rem] items-center gap-2 sm:grid-cols-[minmax(0,10rem)_1fr_3.5rem_2rem] sm:gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  {group === null ? (
                    <Skeleton className="size-3.5 shrink-0 rounded-sm" />
                  ) : (
                    <span
                      className={cn('size-3.5 shrink-0 rounded-sm', GROUP_DOT_CLASSES[group.color])}
                    />
                  )}
                  <span className="min-w-0 truncate text-sm">
                    {group === null ? <TextSkeleton sample="Investimento" /> : group.name}
                  </span>
                </div>
                <Skeleton className="h-2 rounded-full" />
                <span className="text-right font-mono text-sm tabular-nums">
                  <TextSkeleton sample="00%" />
                </span>
                <span className="text-muted-foreground grid size-7 place-items-center [&_svg]:size-4">
                  <MoreHorizontal />
                </span>
              </div>
              <div className="text-muted-foreground pl-5.5 text-xs">
                <TextSkeleton sample="até 0.000,00 · planejado em dez/26 0.000,00 (00%) · até 00%" />
              </div>
            </li>
          ))}
        </ul>
        <span className="justify-self-start">
          <ButtonSkeleton variant="ghost" size="sm" label="Novo grupo" />
        </span>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <ButtonSkeleton label="Salvar metas" icon={null} size="default" />
      </CardFooter>
    </Card>
  )
}

/** `/painel/orcamento` loading: the groups card and the traffic light, numbers blank. */
export function BudgetSkeleton() {
  return (
    <Main aria-busy="true" aria-label="Carregando">
      <div className="grid gap-4">
        <Typography variant="pageTitle" as="h1">
          Orçamento
        </Typography>
        <div className="grid gap-4">
          <GroupsCardSkeleton />
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
              <TrafficLightSkeleton span={WINDOW.span} before={WINDOW.before} />
            </CardContent>
          </Card>
        </div>
      </div>
    </Main>
  )
}
