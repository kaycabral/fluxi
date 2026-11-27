'use client'

import { deleteGoalAction, saveGoalAction } from '@/features/goals/adapters/actions/goals'
import {
  capitalFor,
  EMERGENCY_MONTHS,
  monthsBetween,
  planGoal,
  type Baseline,
  type Goal,
  type GoalKind,
  type GoalPlan,
  type PotSummary,
} from '@/features/goals/core/goals'
import { monthLabel } from '@/features/ledger/core/format'
import { addMonths, type Month } from '@/features/ledger/core/month'
import type { BudgetGroup } from '@/features/ledger/core/types'
import type { LedgerData } from '@/features/ledger/core/view'
import { useAction } from '@/features/ledger/ui/budget/shared'
import { MoneyInput } from '@/features/ledger/ui/money-input'
import { parseBRLInput } from '@cbrl/br/money'
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@cbrl/design'
import { useMemo, useState } from 'react'
import { brl, duration, KIND_HINTS, KIND_LABELS, short } from './format'

/** Create or edit a goal; the preview re-plans it as you type. */

const TARGET_LABELS: Record<GoalKind, string> = {
  independence: 'Renda mensal desejada',
  emergency: 'Valor da reserva',
  recurring: 'Quanto custa por ano',
  purchase: 'Quanto custa hoje',
}

function placeholderFor(kind: GoalKind, base: Baseline): string | undefined {
  if (kind === 'independence') return `padrão de vida: ${brl(base.lifestyleCents)}`
  if (kind === 'emergency')
    return `${EMERGENCY_MONTHS} × essencial: ${brl(base.essentialCents * EMERGENCY_MONTHS)}`
  return undefined
}

type Draft = {
  kind: GoalKind
  name: string
  budgetGroup: string
  target: string
  targetMonth: string
  monthly: string
  initial: string
  withdrawalPct: string
  accountId: string
}

const NO_ACCOUNT = 'none'
const cents = (value: string) => parseBRLInput(value) ?? 0
const typed = (c: number | null) => (c === null || c === 0 ? '' : brl(c).replace('R$', '').trim())

function draftOf(goal: Goal | null, groups: readonly BudgetGroup[], today: Month): Draft {
  const fallback = groups.find((g) => g.key === 'goals' && !g.archived)?.key ?? ''
  return {
    kind: goal?.kind ?? 'purchase',
    name: goal?.name ?? '',
    budgetGroup: goal?.budgetGroup ?? fallback,
    target: typed(goal?.targetCents ?? null),
    targetMonth: goal?.targetMonth ?? addMonths(today, 12),
    monthly: typed(goal?.monthlyCents ?? null),
    initial: typed(goal?.initialCents ?? null),
    withdrawalPct: String((goal?.withdrawalBps ?? 400) / 100).replace('.', ','),
    accountId: goal?.accountId ?? NO_ACCOUNT,
  }
}

/** Default budget group of a kind: wealth goes to Investimento, planned spending to Metas. */
function groupFor(kind: GoalKind, groups: readonly BudgetGroup[], current: string): string {
  const want = kind === 'emergency' || kind === 'independence' ? 'investment' : 'goals'
  return groups.some((g) => g.key === want && !g.archived) ? want : current
}

export function GoalDialog({
  goal,
  groups,
  accounts,
  base,
  pots,
  today,
  onClose,
}: {
  goal: Goal | null
  groups: readonly BudgetGroup[]
  accounts: readonly LedgerData['accounts'][number][]
  base: Baseline
  pots: readonly PotSummary[]
  today: Month
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(goal, groups, today))
  const [pending, run] = useAction()
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const potGroups = groups.filter(
    (g) => g.goal === 'minimum' && (!g.archived || g.key === draft.budgetGroup),
  )
  const dated = draft.kind === 'purchase' || draft.kind === 'recurring'
  const withdrawalBps = Math.round(Number(draft.withdrawalPct.replace(',', '.')) * 100) || 400

  const preview = useMemo(() => {
    const existing = pots.flatMap((p) => p.plans).find((p) => p.goal.id === goal?.id)
    const candidate: Goal = {
      id: goal?.id ?? 'draft',
      name: draft.name,
      kind: draft.kind,
      budgetGroup: draft.budgetGroup,
      targetCents: cents(draft.target) || null,
      targetMonth: dated ? draft.targetMonth : null,
      monthlyCents: cents(draft.monthly),
      initialCents: cents(draft.initial),
      withdrawalBps,
      accountId: draft.accountId === NO_ACCOUNT ? null : draft.accountId,
      startMonth: goal?.startMonth ?? today,
      sort: 0,
    }
    const saved = existing?.savedCents ?? candidate.initialCents
    const pot = pots.find((p) => p.group === draft.budgetGroup)
    const monthly =
      draft.kind === 'independence'
        ? Math.max(
            0,
            (pot?.potCents ?? 0) -
              (pot?.plans
                .filter((p) => p.goal.kind !== 'independence' && p.goal.id !== goal?.id)
                .reduce((s, p) => s + p.monthlyCents, 0) ?? 0),
          )
        : cents(draft.monthly)
    return planGoal(candidate, { saved, monthly }, base, today)
  }, [draft, dated, withdrawalBps, goal, pots, base, today])

  const save = () =>
    run(
      () =>
        saveGoalAction({
          id: goal?.id ?? null,
          name: draft.name,
          kind: draft.kind,
          budgetGroup: draft.budgetGroup,
          targetCents: cents(draft.target) || null,
          targetMonth: dated ? draft.targetMonth : null,
          monthlyCents: draft.kind === 'independence' ? null : cents(draft.monthly),
          initialCents: cents(draft.initial),
          withdrawalBps,
          accountId: draft.accountId === NO_ACCOUNT ? null : draft.accountId,
        }),
      goal === null ? 'Objetivo criado.' : 'Objetivo salvo.',
      onClose,
    )
  const remove = () =>
    goal !== null && run(() => deleteGoalAction(goal.id), 'Objetivo excluído.', onClose)

  const targetLabel = TARGET_LABELS[draft.kind]
  const targetPlaceholder = placeholderFor(draft.kind, base)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{goal === null ? 'Novo objetivo' : goal.name}</DialogTitle>
          <DialogDescription>
            Diga o quê e quando. O quanto guardar vem do seu orçamento.
          </DialogDescription>
        </DialogHeader>

        <form
          id="goal-form"
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          {goal === null && (
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo">
              {(['purchase', 'recurring', 'emergency', 'independence'] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={draft.kind === kind}
                  onClick={() =>
                    set({
                      kind,
                      budgetGroup: groupFor(kind, groups, draft.budgetGroup),
                      name:
                        draft.name === '' || isKindName(draft.name)
                          ? defaultName(kind)
                          : draft.name,
                    })
                  }
                  className={cn(
                    'focus-visible:ring-ring grid rounded-lg border p-2.5 text-left text-sm outline-none focus-visible:ring-2',
                    draft.kind === kind && 'border-primary bg-primary/5',
                  )}
                >
                  <span className="font-medium">{KIND_LABELS[kind]}</span>
                  <span className="text-muted-foreground text-xs">{KIND_HINTS[kind]}</span>
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="goal-name">Nome</Label>
              <Input
                id="goal-name"
                value={draft.name}
                maxLength={60}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="Carro novo"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="goal-group">Sai do grupo</Label>
              <Select value={draft.budgetGroup} onValueChange={(v) => set({ budgetGroup: v })}>
                <SelectTrigger id="goal-group" className="w-full">
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {potGroups.map((g) => (
                    <SelectItem key={g.key} value={g.key}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="goal-target">{targetLabel}</Label>
              <MoneyInput
                id="goal-target"
                value={draft.target}
                onValueChange={(target) => set({ target })}
                placeholder={targetPlaceholder}
              />
            </div>
            {dated && (
              <div className="grid gap-1.5">
                <Label htmlFor="goal-month">
                  {draft.kind === 'recurring' ? 'Próxima vez' : 'Até quando'}
                </Label>
                <Input
                  id="goal-month"
                  type="month"
                  value={draft.targetMonth}
                  min={addMonths(today, 1)}
                  onChange={(e) => set({ targetMonth: e.target.value })}
                />
              </div>
            )}
            {draft.kind === 'independence' ? (
              <div className="grid gap-1.5">
                <Label htmlFor="goal-withdrawal">Taxa de retirada (% ao ano)</Label>
                <Input
                  id="goal-withdrawal"
                  inputMode="decimal"
                  value={draft.withdrawalPct}
                  onChange={(e) => set({ withdrawalPct: e.target.value })}
                />
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor="goal-monthly">Fatia por mês</Label>
                <MoneyInput
                  id="goal-monthly"
                  value={draft.monthly}
                  onValueChange={(monthly) => set({ monthly })}
                />
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="goal-initial">Já tenho guardado</Label>
              <MoneyInput
                id="goal-initial"
                value={draft.initial}
                onValueChange={(initial) => set({ initial })}
                disabled={draft.accountId !== NO_ACCOUNT}
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="goal-account">Conta dedicada (opcional)</Label>
              <Select value={draft.accountId} onValueChange={(v) => set({ accountId: v })}>
                <SelectTrigger id="goal-account" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_ACCOUNT}>Nenhuma: saldo pelo que entra no grupo</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Preview plan={preview} base={base} today={today} />
        </form>

        <DialogFooter className="gap-2 sm:justify-between">
          {goal !== null ? (
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={remove}
              disabled={pending}
            >
              Excluir
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" form="goal-form" disabled={pending || draft.budgetGroup === ''}>
              Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function defaultName(kind: GoalKind): string {
  return kind === 'purchase' ? '' : KIND_LABELS[kind]
}
function isKindName(name: string): boolean {
  return Object.values(KIND_LABELS).includes(name)
}

function Preview({ plan, base, today }: { plan: GoalPlan; base: Baseline; today: Month }) {
  const { goal } = plan
  if (plan.targetCents <= 0) {
    return <p className="text-muted-foreground text-sm">Informe o valor para ver o plano.</p>
  }
  let title: string
  let detail: string
  if (goal.kind === 'independence') {
    const lean = capitalFor(base.essentialCents, goal.withdrawalBps)
    title = `Juntar ${short(plan.targetCents)}: ${duration(plan.etaMonths)} com ${brl(plan.monthlyCents)}/mês.`
    detail = `Marco no caminho: viver só do essencial (${short(lean)}).`
  } else if (plan.neededCents !== null && plan.due !== null) {
    const months = monthsBetween(today, plan.due)
    title =
      plan.status === 'on_track' || plan.status === 'done'
        ? `Cabe: ${brl(plan.monthlyCents)}/mês chega lá até ${monthLabel(plan.due)}.`
        : `Precisa de ${brl(plan.neededCents)}/mês para ${monthLabel(plan.due)} (${duration(months)}).`
    detail =
      plan.status === 'on_track' || plan.status === 'done'
        ? `Mínimo necessário: ${brl(plan.neededCents)}/mês.`
        : `Com ${brl(plan.monthlyCents)}/mês, chega em ${duration(plan.etaMonths)}.`
  } else {
    title = `Com ${brl(plan.monthlyCents)}/mês, completa em ${duration(plan.etaMonths)}.`
    detail = 'A reserva tem prioridade no grupo até encher; cheia, a fatia vai para os demais.'
  }
  return (
    <div className="bg-muted/60 grid gap-0.5 rounded-lg px-3 py-2.5">
      <span className="font-semibold">{title}</span>
      <span className="text-muted-foreground text-sm">{detail}</span>
    </div>
  )
}
