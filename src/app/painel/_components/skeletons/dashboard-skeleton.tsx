'use client'

import {
  GroupName,
  LoadingStatus,
  MoneySkeleton,
  PageHeaderSkeleton,
  SKELETON_ROOT,
  TextSkeleton,
  TrafficLightSkeleton,
  useSkeletonGroups,
  useSkeletonMonth,
  VisualText,
} from '@/app/painel/_components/skeletons/parts'
import { dayLongLabel, monthLabel } from '@/features/ledger/core/format'
import { useLedgerRefs } from '@/features/ledger/ui/ledger-shell'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  Main,
  Skeleton,
} from '@cbrl/design'
import { ArrowRight } from 'lucide-react'

/** The dashboard's budget window (`BUDGET_WINDOW`). */
const WINDOW = { span: 5, before: 0 }

/** A card's link ("Orçamento →"): the box of the real ghost `sm` button. */
function CardLink({ label }: { label: string }) {
  return (
    <CardAction>
      <span className="inline-flex h-7 items-center gap-1 px-2.5 text-[0.8rem] font-medium [&_svg]:size-3.5">
        <VisualText text={label} /> <ArrowRight />
      </span>
    </CardAction>
  )
}

function Stat({
  label,
  hint = '',
  twoLines = false,
}: {
  label: React.ReactNode
  /** Sample of the line under the amount. */
  hint?: string
  twoLines?: boolean
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>
          {typeof label === 'string' ? <VisualText text={label} /> : label}
        </CardDescription>
        <CardTitle className="text-2xl">
          <MoneySkeleton sample="R$ 000.000,00" />
        </CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground -mt-2 text-xs">
        {twoLines ? (
          // "Saldo hoje": the bank avatars, then the update status.
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Skeleton className="h-6 w-[88px] rounded-full" />
            <span>
              <TextSkeleton sample="Aguardando a 1ª atualização" />
            </span>
          </span>
        ) : (
          <TextSkeleton sample={hint} />
        )}
      </CardContent>
    </Card>
  )
}

/** "Contas" (upcoming bills) loading: the tabs line and a column of rows. */
function BillsSkeleton() {
  return (
    <Card className="h-[30rem] min-w-0 lg:h-auto lg:contain-size">
      <CardHeader>
        <CardTitle asChild>
          <h2>
            <VisualText text="Contas" />
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        <div className="flex h-full flex-col gap-3">
          <div className="border-border flex h-9 w-full items-center gap-4 border-b">
            {['Atrasadas', '7 dias', 'Este mês', 'Próximo mês'].map((tab) => (
              <span key={tab} className="text-muted-foreground text-sm font-medium">
                <VisualText text={tab} />
              </span>
            ))}
          </div>
          <ul className="divide-border -mr-2 min-h-0 flex-1 divide-y overflow-hidden pr-2">
            {Array.from({ length: 8 }, (_, i) => (
              <li key={i} className="flex items-center gap-2 py-2">
                <span className="font-mono text-xs">
                  <TextSkeleton sample="00/00/00" />
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="text-sm">
                    <TextSkeleton sample="Descrição da conta" />
                  </span>
                  <span className="text-xs">
                    <TextSkeleton sample="Banco · Conta" />
                  </span>
                </span>
                <Skeleton className="h-7 w-[124px]" />
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}

/** `/painel` loading: the dashboard's cards with their data blank. */
export function DashboardSkeleton() {
  const refs = useLedgerRefs()
  const month = useSkeletonMonth()
  const groups = useSkeletonGroups()
  return (
    <>
      <LoadingStatus />
      <Main {...SKELETON_ROOT}>
        <div className="grid gap-4">
          <PageHeaderSkeleton
            title="Painel"
            align="end"
            subtitle={
              refs === null ? (
                <TextSkeleton sample="Sexta-feira, 27 de novembro" />
              ) : (
                <VisualText text={dayLongLabel(refs.today)} />
              )
            }
          />

          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Saldo hoje" twoLines />
            <Stat
              label={
                month === null ? (
                  <TextSkeleton sample="Fim de nov/26" />
                ) : (
                  <VisualText text={`Fim de ${monthLabel(month)}`} />
                )
              }
            />
            <Stat label="Resultado do mês" hint="Entradas R$ 0.000,00 · Saídas R$ 0.000,00" />
            <Stat label="Menor saldo previsto" hint="Em 00/00, até o fim do próximo mês" />
          </section>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <Card className="min-w-0">
              <CardHeader>
                <CardTitle asChild>
                  <h2>
                    <VisualText text="Orçamento" />
                  </h2>
                </CardTitle>
                <CardDescription>
                  <TextSkeleton sample="Novembro: 0 dentro, 0 perto e 0 fora da meta." />
                </CardDescription>
                <CardLink label="Orçamento" />
              </CardHeader>
              <CardContent className="min-w-0">
                <TrafficLightSkeleton span={WINDOW.span} before={WINDOW.before} />
              </CardContent>
            </Card>
            <BillsSkeleton />
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-3">
            <Card className="h-[22rem] min-w-0 lg:col-span-2">
              <CardHeader>
                <CardTitle asChild>
                  <h2>
                    <VisualText text="Saldo projetado" />
                  </h2>
                </CardTitle>
                <CardDescription>
                  <VisualText text="Saldo de todas as contas no fim de cada mês." />
                </CardDescription>
                <CardLink label="Calendário" />
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col">
                <Skeleton className="min-h-0 flex-1" />
              </CardContent>
            </Card>

            <Card className="h-[22rem] min-w-0">
              <CardHeader>
                <CardTitle asChild>
                  <h2>
                    {month === null ? (
                      <TextSkeleton sample="Grupos em nov/26" />
                    ) : (
                      <VisualText text={`Grupos em ${monthLabel(month)}`} />
                    )}
                  </h2>
                </CardTitle>
                <CardDescription>
                  <VisualText text="Planejado ÷ meta · renda " />
                  <TextSkeleton sample="0.000,00" />
                </CardDescription>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 overflow-hidden">
                <ul className="grid gap-3">
                  {groups.map((row) => (
                    <li key={row.key} className={cn('grid gap-1', row.hintClass)}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <GroupName group={row.group} />
                        <span className="shrink-0 font-mono text-xs tabular-nums">
                          <TextSkeleton sample="0.000,00 / 0.000,00" />
                        </span>
                      </div>
                      <Skeleton className="h-1.5 rounded-full" />
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </Main>
    </>
  )
}
