'use client'

import {
  ButtonSkeleton,
  GroupName,
  LoadingStatus,
  SKELETON_ROOT,
  TextSkeleton,
  useSkeletonGroups,
  VisualText,
} from '@/app/painel/_components/skeletons/parts'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  Main,
  Skeleton,
  Typography,
} from '@cbrl/design'

const BASELINE = ['Renda média', 'Essencial médio', 'Padrão de vida'] as const

/** `/painel/objetivos` loading: the header, the averages and a card per goals group, blank. */
export function GoalsSkeleton() {
  const pots = useSkeletonGroups('pots')
  return (
    <>
      <LoadingStatus />
      <Main {...SKELETON_ROOT}>
        <div className="grid gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="grid gap-1">
              <Typography variant="pageTitle" as="h1">
                <VisualText text="Objetivos" />
              </Typography>
              <div className="text-muted-foreground text-sm">
                <TextSkeleton sample="Os 0 objetivos estão no trilho." />
              </div>
            </div>
            <ButtonSkeleton label="Novo objetivo" />
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            {BASELINE.map((label) => (
              <div key={label} className="grid">
                <span className="text-muted-foreground text-xs">
                  <VisualText text={label} />
                </span>
                <span className="font-semibold tabular-nums">
                  <TextSkeleton sample="R$ 00.000,00" />
                </span>
              </div>
            ))}
            <div className="grid">
              <span className="text-muted-foreground text-xs">
                <VisualText text="Base" />
              </span>
              <span className="text-sm">
                <TextSkeleton sample="últimos 6 meses · orçamento de dez/26 em diante" />
              </span>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {pots.map(({ key, group, hintClass }) => (
              <Card key={key} className={cn('min-w-0', hintClass)}>
                <CardHeader>
                  <CardTitle asChild>
                    <h2>
                      <GroupName group={group} size="size-3 rounded-sm" />
                    </h2>
                  </CardTitle>
                  <CardDescription>
                    <TextSkeleton sample="R$ 0.000,00/mês · 00% da renda no orçamento" />
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3">
                  <Skeleton className="h-2.5 rounded-full" />
                  <div className="text-muted-foreground text-sm">
                    <TextSkeleton sample="Nenhum objetivo neste grupo." />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </Main>
    </>
  )
}
