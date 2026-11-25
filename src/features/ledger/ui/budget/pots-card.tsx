'use client'

import {
  deleteBudgetPlanAction,
  saveBudgetPlanAction,
  updatePotAction,
} from '@/features/ledger/adapters/actions/budget'
import {
  clampTarget,
  freeBps,
  maxBpsFor,
  planFor,
  potCell,
  sameTargets,
  sortPlans,
  type BudgetMonth,
  type Targets,
} from '@/features/ledger/core/budget'
import { formatMoney, formatPercent, monthLabel } from '@/features/ledger/core/format'
import { POT_DOT_CLASSES } from '@/features/ledger/core/labels'
import type { Month } from '@/features/ledger/core/month'
import type { BudgetPlan, Pot } from '@/features/ledger/core/types'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@cbrl/design'
import {
  CalendarPlus,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { PlanStartDialog } from './plan-start-dialog'
import { ColorPicker, NewPotRow, PotMenu, PotName } from './pot-controls'
import { planLabel, useAction } from './shared'

/**
 * "Potes da renda": the targets of one budget version (sliders that never
 * pass 100%) and the pots themselves, edited in place: color, name (double
 * click or menu), how they are measured, delete/archive and new pots.
 */
export function PotsCard({
  pots,
  plans,
  today,
  current,
}: {
  pots: readonly Pot[]
  plans: readonly BudgetPlan[]
  today: Month
  /** Budget numbers of the current month (planned and the target in reais). */
  current: BudgetMonth
}) {
  const sorted = sortPlans(plans)
  const inForce = planFor(today, sorted) ?? sorted.at(-1)
  const [selectedStart, setSelectedStart] = useState(inForce?.startsMonth)
  const plan = sorted.find((p) => p.startsMonth === selectedStart) ?? inForce
  if (plan === undefined || inForce === undefined) return null
  // A new key (another version, or its targets saved) starts the editor over from the saved targets.
  return (
    <PlanEditor
      key={`${plan.id}:${JSON.stringify(plan.targets)}`}
      pots={pots}
      plan={plan}
      plans={sorted}
      isCurrent={plan.id === inForce.id}
      today={today}
      current={current}
      onSelect={setSelectedStart}
    />
  )
}

type Confirm = { title: string; description: string; action: string; onConfirm: () => void }

function PlanEditor({
  pots,
  plan,
  plans: sorted,
  isCurrent,
  today,
  current,
  onSelect,
}: {
  pots: readonly Pot[]
  plan: BudgetPlan
  plans: readonly BudgetPlan[]
  isCurrent: boolean
  today: Month
  current: BudgetMonth
  onSelect: (startsMonth: Month | undefined) => void
}) {
  const [targets, setTargets] = useState<Targets>(plan.targets)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [dialog, setDialog] = useState<'create' | 'move' | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [pending, run] = useAction()

  const free = freeBps(targets)
  const dirty = !sameTargets(targets, plan.targets)
  const ordered = [...pots].sort((a, b) => a.sort - b.sort)
  const shown = ordered.filter((p) => !p.archived || (targets[p.key] ?? 0) > 0)
  const archived = ordered.filter((p) => p.archived && (targets[p.key] ?? 0) === 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h2>Potes da renda</h2>
        </CardTitle>
        <CardDescription>
          Cada pote recebe uma fatia da renda do mês. A soma não passa de 100%.
        </CardDescription>
        <CardAction className="flex items-center gap-1">
          <Select
            value={plan.startsMonth}
            onValueChange={(m) => {
              if (!dirty) onSelect(m)
              else
                setConfirm({
                  title: 'Descartar as mudanças?',
                  description: 'As metas alteradas nesta versão ainda não foram salvas.',
                  action: 'Descartar',
                  onConfirm: () => onSelect(m),
                })
            }}
          >
            <SelectTrigger size="sm" aria-label="Versão do orçamento" className="w-auto">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {[...sorted].reverse().map((p) => (
                <SelectItem key={p.id} value={p.startsMonth}>
                  {planLabel(p, sorted)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Versões do orçamento">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setDialog('create')}>
                <CalendarPlus /> Nova versão…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setDialog('move')}>
                <Pencil /> Mudar início…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={sorted.length <= 1}
                onSelect={() =>
                  setConfirm({
                    title: `Excluir a versão ${planLabel(plan, sorted)}?`,
                    description:
                      'Os meses dela passam a ser medidos pela versão anterior (ou ficam sem meta, se não houver).',
                    action: 'Excluir versão',
                    onConfirm: () =>
                      run(
                        () => deleteBudgetPlanAction(plan.id),
                        'Versão excluída.',
                        () => onSelect(undefined),
                      ),
                  })
                }
              >
                <Trash2 /> Excluir versão
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardAction>
      </CardHeader>

      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-xs">
            {isCurrent ? 'Versão em vigor' : 'Versão'} de {planLabel(plan, sorted)}
          </p>
          <Badge
            variant="secondary"
            className={
              free > 0
                ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
                : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
            }
            aria-live="polite"
          >
            {free > 0 ? `${formatPercent(free / 10000)} livre para distribuir` : '100% distribuído'}
          </Badge>
        </div>

        <div className="bg-muted flex h-3 overflow-hidden rounded-full" aria-hidden>
          {shown.map((pot) => (
            <span
              key={pot.key}
              className={cn('transition-[width]', POT_DOT_CLASSES[pot.color])}
              style={{ width: `${(targets[pot.key] ?? 0) / 100}%` }}
            />
          ))}
        </div>

        <ul className="grid gap-3">
          {shown.map((pot) => {
            const bps = targets[pot.key] ?? 0
            const id = `pot-${pot.key}`
            const cell = potCell(pot, current)
            const income = current.incomeCents
            return (
              <li key={pot.key} className="grid gap-1">
                <div className="grid grid-cols-[minmax(0,8rem)_1fr_3.25rem_2rem] items-center gap-2 sm:grid-cols-[minmax(0,10rem)_1fr_3.5rem_2rem] sm:gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <ColorPicker pot={pot} />
                    <PotName
                      pot={pot}
                      htmlFor={id}
                      editing={renaming === pot.key}
                      onEditingChange={(on) => setRenaming(on ? pot.key : null)}
                    />
                  </div>
                  <input
                    id={id}
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round(bps / 100)}
                    aria-valuetext={formatPercent(bps / 10000)}
                    className="accent-primary w-full"
                    onChange={(e) =>
                      setTargets((t) => clampTarget(t, pot.key, Number(e.target.value) * 100))
                    }
                  />
                  <span className="text-right font-mono text-sm tabular-nums">
                    {formatPercent(bps / 10000)}
                  </span>
                  <PotMenu pot={pot} onRename={() => setRenaming(pot.key)} />
                </div>
                <p className="text-muted-foreground pl-5.5 text-xs">
                  {pot.goal === 'minimum' ? 'guardar ao menos' : 'até'}{' '}
                  {formatMoney(Math.round((income * bps) / 10000))} · planejado em{' '}
                  {monthLabel(current.month)} {formatMoney(cell.plannedCents)} (
                  {formatPercent(cell.ratio)}) · até{' '}
                  {formatPercent(maxBpsFor(targets, pot.key) / 10000)}
                </p>
              </li>
            )
          })}
        </ul>

        {adding ? (
          <NewPotRow pots={pots} onCancel={() => setAdding(false)} />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="justify-self-start"
            onClick={() => setAdding(true)}
          >
            <Plus /> Novo pote
          </Button>
        )}

        {archived.length > 0 && (
          <details className="text-sm">
            <summary className="text-muted-foreground cursor-pointer text-xs">
              Arquivados ({archived.length})
            </summary>
            <ul className="mt-2 grid gap-1">
              {archived.map((pot) => (
                <li key={pot.key} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className={cn('size-2.5 rounded-xs', POT_DOT_CLASSES[pot.color])} />
                    {pot.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => run(() => updatePotAction({ key: pot.key, archived: false }))}
                  >
                    <RotateCcw /> Restaurar
                  </Button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>

      <CardFooter className="justify-end gap-2">
        {dirty && (
          <Button variant="ghost" onClick={() => setTargets(plan.targets)} disabled={pending}>
            Desfazer
          </Button>
        )}
        <Button
          disabled={!dirty || pending}
          onClick={() =>
            run(
              () => saveBudgetPlanAction({ id: plan.id, startsMonth: plan.startsMonth, targets }),
              'Metas salvas.',
            )
          }
        >
          {pending && <Loader2 className="animate-spin" />}
          Salvar metas
        </Button>
      </CardFooter>

      {dialog !== null && (
        <PlanStartDialog
          key={dialog}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          mode={dialog}
          plan={plan}
          plans={sorted}
          today={today}
          targets={targets}
          onSaved={onSelect}
        />
      )}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                confirm?.onConfirm()
                setConfirm(null)
              }}
            >
              {confirm?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
