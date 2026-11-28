'use client'

import { saveGoalAction } from '@/features/goals/adapters/actions/goals'
import {
  EMERGENCY_MONTHS,
  planningVersion,
  summarize,
  type Baseline,
  type Goal,
  type GoalKind,
  type GoalPlan,
  type GoalStatus,
  type PotSummary,
} from '@/features/goals/core/goals'
import { budgetMonths } from '@/features/ledger/core/budget'
import { monthLabel } from '@/features/ledger/core/format'
import { GROUP_DOT_CLASSES } from '@/features/ledger/core/labels'
import { addMonths, type Month } from '@/features/ledger/core/month'
import type { BudgetGroup, BudgetVersion } from '@/features/ledger/core/types'
import { projectWindow, type LedgerData } from '@/features/ledger/core/view'
import { useAction } from '@/features/ledger/ui/budget/shared'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
  Typography,
} from '@cbrl/design'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { brl, duration, short } from './format'
import { GoalDialog } from './goal-dialog'

/**
 * "Objetivos": each `minimum` budget group (Investimento, Metas) is a pot split
 * into goal slices. Balances fill on their own from what actually went into the
 * group (or a dedicated account); the dialog simulates as you type.
 */

const STATUS: Record<GoalStatus, { label: string; className: string }> = {
  done: {
    label: 'Concluído',
    className: 'bg-success-muted text-success-muted-foreground',
  },
  on_track: {
    label: 'No trilho',
    className: 'bg-success-muted text-success-muted-foreground',
  },
  tight: { label: 'Apertado', className: 'bg-warning-muted text-warning-muted-foreground' },
  late: { label: 'Fora do prazo', className: 'bg-destructive/10 text-destructive' },
  remainder: {
    label: 'Recebe o resto',
    className: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300',
  },
}

function useGoalsModel(data: LedgerData, versions: readonly BudgetVersion[], today: Month) {
  return useMemo(() => {
    const results = projectWindow(data, addMonths(today, -24), today)
    const months = budgetMonths(results, versions)
    const balances = results.at(-1)?.closingBalances ?? {}
    return { months, balances }
  }, [data, versions, today])
}

export function GoalsView({
  data,
  versions,
  goals,
  today,
}: {
  data: LedgerData
  versions: readonly BudgetVersion[]
  goals: readonly Goal[]
  today: Month
}) {
  const { months, balances } = useGoalsModel(data, versions, today)
  const version = useMemo(() => planningVersion(versions), [versions])
  const { base, pots } = useMemo(
    () =>
      summarize(
        { goals, months, current: today, accountBalances: balances, version },
        data.budgetGroups,
      ),
    [goals, data.budgetGroups, months, today, balances, version],
  )
  const [editing, setEditing] = useState<Goal | GoalKind | null>(null)
  const groupOf = (key: string) => data.budgetGroups.find((g) => g.key === key)
  const late = pots
    .flatMap((p) => p.plans)
    .filter((p) => p.status === 'late' || p.status === 'tight')
  const over = pots.filter((p) => p.freeCents < 0)

  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <Typography variant="pageTitle" as="h1">
            Objetivos
          </Typography>
          <p className="text-muted-foreground text-sm">
            {headline(goals.length, late.length, over.length)}
          </p>
        </div>
        <Button size="lg" onClick={() => setEditing('purchase')}>
          <Plus /> Novo objetivo
        </Button>
      </div>

      <BaselineStrip base={base} version={version} />

      <Suggestions
        goals={goals}
        groups={data.budgetGroups}
        base={base}
        pots={pots}
        onAdjust={(kind) => setEditing(kind)}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {pots.map((pot) => {
          const group = groupOf(pot.group)
          return group === undefined ? null : (
            <PotCard
              key={pot.group}
              pot={pot}
              group={group}
              base={base}
              onOpen={(goal) => setEditing(goal)}
            />
          )
        })}
      </div>

      {editing !== null && (
        <GoalDialog
          goal={typeof editing === 'string' ? null : editing}
          kind={typeof editing === 'string' ? editing : editing.kind}
          groups={data.budgetGroups}
          accounts={data.accounts.filter((a) => !a.archived)}
          base={base}
          pots={pots}
          today={today}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}

/**
 * Emergency fund and independence offered ready-made while missing: computed
 * from the averages, accepted in one click or adjusted in the dialog. Nothing
 * is offered before a complete month with income (the numbers would be made up).
 */
function Suggestions({
  goals,
  groups,
  base,
  pots,
  onAdjust,
}: {
  goals: readonly Goal[]
  groups: readonly BudgetGroup[]
  base: Baseline
  pots: readonly PotSummary[]
  onAdjust: (kind: GoalKind) => void
}) {
  const [pending, run] = useAction()
  const investment = groups.some((g) => g.key === 'investment' && !g.archived)
  if (base.months === 0 || !investment) return null
  const has = (kind: GoalKind) => goals.some((g) => g.kind === kind)
  const offers = suggestedGoals(base, pots).filter((o) => !has(o.kind))
  if (offers.length === 0) return null
  return (
    <section aria-label="Sugestões" className="grid gap-2 sm:grid-cols-2">
      {offers.map((offer) => (
        <div
          key={offer.kind}
          className="border-primary/40 bg-primary/5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-3"
        >
          <div className="grid min-w-0 gap-0.5">
            <span className="text-muted-foreground text-xs">Sugestão</span>
            <span className="font-medium">{offer.name}</span>
            <span className="text-muted-foreground text-sm">{offer.detail}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => onAdjust(offer.kind)}>
              Ajustar
            </Button>
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run(() => saveGoalAction(offer.input), 'Objetivo criado.')}
            >
              Aceitar
            </Button>
          </div>
        </div>
      ))}
    </section>
  )
}

function suggestedGoals(base: Baseline, pots: readonly PotSummary[]) {
  const pot = pots.find((p) => p.group === 'investment')?.potCents ?? 0
  const target = base.essentialCents * EMERGENCY_MONTHS
  // Fill the fund in about a year, never past the whole pot.
  const slice = Math.min(pot, Math.ceil(target / 12 / 100) * 100)
  const common = {
    id: null,
    budgetGroup: 'investment',
    targetCents: null,
    targetMonth: null,
    initialCents: 0,
    withdrawalBps: 400,
    accountId: null,
  }
  return [
    {
      kind: 'emergency' as const,
      name: 'Reserva de emergência',
      detail: `${short(target)} (${EMERGENCY_MONTHS} × essencial) · ${brl(slice)}/mês`,
      input: { ...common, name: 'Reserva de emergência', kind: 'emergency', monthlyCents: slice },
    },
    {
      kind: 'independence' as const,
      name: 'Independência financeira',
      detail: `Viver com ${brl(base.lifestyleCents)}/mês · recebe o resto do Investimento`,
      input: {
        ...common,
        name: 'Independência financeira',
        kind: 'independence',
        monthlyCents: null,
      },
    },
  ]
}

function headline(count: number, late: number, over: number): string {
  if (count === 0) return 'Diga o quê e quando; o Fluxi calcula quanto guardar com o seu orçamento.'
  if (over > 0) return 'Os objetivos pedem mais do que o orçamento separa. Veja o que cede.'
  if (late > 0)
    return `${late} de ${count} ${count === 1 ? 'objetivo precisa' : 'objetivos precisam'} de ajuste.`
  return `${count === 1 ? 'Seu objetivo está' : `Os ${count} objetivos estão`} no trilho.`
}

function BaselineStrip({ base, version }: { base: Baseline; version: BudgetVersion | null }) {
  if (base.months === 0) {
    return (
      <p className="bg-muted rounded-md px-3 py-2 text-sm">
        Ainda não há meses completos com renda. As projeções aparecem depois do primeiro mês.
      </p>
    )
  }
  const items = [
    ['Renda média', base.incomeCents],
    ['Essencial médio', base.essentialCents],
    ['Padrão de vida', base.lifestyleCents],
  ] as const
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="grid">
          <span className="text-muted-foreground text-xs">{label}</span>
          <span className="font-semibold tabular-nums">{brl(value)}</span>
        </div>
      ))}
      <div className="grid">
        <span className="text-muted-foreground text-xs">Base</span>
        <span className="text-sm">
          últimos {base.months} meses
          {version === null ? '' : ` · orçamento de ${monthLabel(version.startsMonth)} em diante`}
        </span>
      </div>
    </div>
  )
}

function PotCard({
  pot,
  group,
  base,
  onOpen,
}: {
  pot: PotSummary
  group: BudgetGroup
  base: Baseline
  onOpen: (goal: Goal) => void
}) {
  const scale = Math.max(pot.potCents, pot.allocatedCents, 1)
  const pct = base.incomeCents > 0 ? Math.round((pot.potCents / base.incomeCents) * 100) : 0
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle asChild>
          <h2 className="flex items-center gap-2">
            <span className={cn('size-3 rounded-sm', GROUP_DOT_CLASSES[group.color])} />
            {group.name}
          </h2>
        </CardTitle>
        <CardDescription>
          {brl(pot.potCents)}/mês · {pct}% da renda no orçamento
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="bg-muted flex h-2.5 overflow-hidden rounded-full" aria-hidden>
          {pot.plans.map((p, i) => (
            <span
              key={p.goal.id}
              className={cn('h-full', SLICE_TONES[i % SLICE_TONES.length])}
              style={{ width: `${(p.monthlyCents / scale) * 100}%` }}
            />
          ))}
        </div>
        <PotNote pot={pot} />
        {pot.plans.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum objetivo neste grupo.</p>
        ) : (
          <ul className="grid gap-2">
            {pot.plans.map((plan, i) => (
              <li key={plan.goal.id}>
                <GoalRow
                  plan={plan}
                  tone={SLICE_TONES[i % SLICE_TONES.length] ?? ''}
                  onOpen={onOpen}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

const SLICE_TONES = ['bg-emerald-500', 'bg-indigo-500', 'bg-amber-500', 'bg-rose-500', 'bg-sky-500']

function PotNote({ pot }: { pot: PotSummary }) {
  if (pot.potCents === 0 && pot.plans.length > 0) {
    return (
      <p className="bg-warning-muted text-warning-muted-foreground rounded-md px-3 py-2 text-sm">
        Este grupo está com 0% no orçamento.{' '}
        <Link href="/painel/orcamento" className="font-medium underline">
          Defina um % no Orçamento
        </Link>{' '}
        para os objetivos andarem.
      </p>
    )
  }
  if (pot.freeCents < 0) {
    return (
      <p className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
        As fatias somam {brl(pot.allocatedCents)}, {brl(-pot.freeCents)} a mais que o grupo. Reduza
        uma fatia ou suba o % no Orçamento.
      </p>
    )
  }
  if (pot.freeCents > 0 && pot.plans.length > 0) {
    return (
      <p className="text-muted-foreground text-sm">{brl(pot.freeCents)}/mês livres no grupo.</p>
    )
  }
  return null
}

function GoalRow({
  plan,
  tone,
  onOpen,
}: {
  plan: GoalPlan
  tone: string
  onOpen: (goal: Goal) => void
}) {
  const { goal } = plan
  const progress = plan.targetCents > 0 ? Math.min(1, plan.savedCents / plan.targetCents) : 0
  const status = STATUS[plan.status]
  return (
    <button
      type="button"
      onClick={() => onOpen(goal)}
      className="hover:border-primary/50 focus-visible:ring-ring grid w-full gap-1.5 rounded-lg border p-3 text-left outline-none focus-visible:ring-2"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn('size-2.5 shrink-0 rounded-sm', tone)} />
          <span className="truncate font-medium">{goal.name}</span>
        </span>
        <span className="font-semibold whitespace-nowrap tabular-nums">
          {brl(plan.monthlyCents)}/mês
        </span>
      </span>
      <span className="bg-muted h-1.5 overflow-hidden rounded-full">
        <span className={cn('block h-full', tone)} style={{ width: `${progress * 100}%` }} />
      </span>
      <span className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>
          {short(plan.savedCents)} de {short(plan.targetCents)} · {when(plan)}
        </span>
        <Badge variant="secondary" className={status.className}>
          {status.label}
        </Badge>
      </span>
    </button>
  )
}

function when(plan: GoalPlan): string {
  if (plan.status === 'done') return 'meta atingida'
  if (plan.due !== null) {
    const recurring = plan.goal.kind === 'recurring' ? ' · todo ano' : ''
    return `até ${monthLabel(plan.due)}${recurring}`
  }
  return `chega em ${duration(plan.etaMonths)}`
}
