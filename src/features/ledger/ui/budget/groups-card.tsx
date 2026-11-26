'use client'

import {
  deleteBudgetVersionAction,
  saveBudgetVersionAction,
  updateBudgetGroupAction,
} from '@/features/ledger/adapters/actions/budget'
import {
  budgetGroupCell,
  clampTarget,
  freeBps,
  maxBpsFor,
  sameTargets,
  sortVersions,
  versionFor,
  type BudgetMonth,
  type Targets,
} from '@/features/ledger/core/budget'
import { formatMoney, formatPercent, monthLabel } from '@/features/ledger/core/format'
import { GROUP_DOT_CLASSES } from '@/features/ledger/core/labels'
import type { Month } from '@/features/ledger/core/month'
import type { BudgetGroup, BudgetVersion } from '@/features/ledger/core/types'
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
import { BudgetGroupMenu, BudgetGroupName, ColorPicker, NewBudgetGroupRow } from './group-controls'
import { useAction, versionLabel } from './shared'
import { VersionStartDialog } from './version-start-dialog'

/**
 * "Grupos do orçamento": the targets of one budget version (sliders that never
 * pass 100%) and the budget groups themselves, edited in place: color, name (double
 * click or menu), how they are measured, delete/archive and new budget groups.
 */
export function BudgetGroupsCard({
  budgetGroups,
  versions,
  today,
  current,
}: {
  budgetGroups: readonly BudgetGroup[]
  versions: readonly BudgetVersion[]
  today: Month
  /** Budget numbers of the current month (planned and the target in reais). */
  current: BudgetMonth
}) {
  const sorted = sortVersions(versions)
  const inForce = versionFor(today, sorted) ?? sorted.at(-1)
  const [selectedStart, setSelectedStart] = useState(inForce?.startsMonth)
  const version = sorted.find((p) => p.startsMonth === selectedStart) ?? inForce
  if (version === undefined || inForce === undefined) return null
  // A new key (another version, or its targets saved) starts the editor over from the saved targets.
  return (
    <VersionEditor
      key={`${version.id}:${JSON.stringify(version.targets)}`}
      budgetGroups={budgetGroups}
      version={version}
      versions={sorted}
      isCurrent={version.id === inForce.id}
      today={today}
      current={current}
      onSelect={setSelectedStart}
    />
  )
}

type Confirm = { title: string; description: string; action: string; onConfirm: () => void }

function VersionEditor({
  budgetGroups,
  version,
  versions: sorted,
  isCurrent,
  today,
  current,
  onSelect,
}: {
  budgetGroups: readonly BudgetGroup[]
  version: BudgetVersion
  versions: readonly BudgetVersion[]
  isCurrent: boolean
  today: Month
  current: BudgetMonth
  onSelect: (startsMonth: Month | undefined) => void
}) {
  const [targets, setTargets] = useState<Targets>(version.targets)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [dialog, setDialog] = useState<'create' | 'move' | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)
  const [pending, run] = useAction()

  const free = freeBps(targets)
  const dirty = !sameTargets(targets, version.targets)
  const ordered = [...budgetGroups].sort((a, b) => a.sort - b.sort)
  const shown = ordered.filter((p) => !p.archived || (targets[p.key] ?? 0) > 0)
  const archived = ordered.filter((p) => p.archived && (targets[p.key] ?? 0) === 0)

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
          <Select
            value={version.startsMonth}
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
                  {versionLabel(p, sorted)}
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
                    title: `Excluir a versão ${versionLabel(version, sorted)}?`,
                    description:
                      'Os meses dela passam a ser medidos pela versão anterior (ou ficam sem meta, se não houver).',
                    action: 'Excluir versão',
                    onConfirm: () =>
                      run(
                        () => deleteBudgetVersionAction(version.id),
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
            {isCurrent ? 'Versão em vigor' : 'Versão'} de {versionLabel(version, sorted)}
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
          {shown.map((budgetGroup) => (
            <span
              key={budgetGroup.key}
              className={cn('transition-[width]', GROUP_DOT_CLASSES[budgetGroup.color])}
              style={{ width: `${(targets[budgetGroup.key] ?? 0) / 100}%` }}
            />
          ))}
        </div>

        <ul className="grid gap-3">
          {shown.map((budgetGroup) => {
            const bps = targets[budgetGroup.key] ?? 0
            const id = `budget-group-${budgetGroup.key}`
            const cell = budgetGroupCell(budgetGroup, current)
            const income = current.incomeCents
            return (
              <li key={budgetGroup.key} className="grid gap-1">
                <div className="grid grid-cols-[minmax(0,8rem)_1fr_3.25rem_2rem] items-center gap-2 sm:grid-cols-[minmax(0,10rem)_1fr_3.5rem_2rem] sm:gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <ColorPicker budgetGroup={budgetGroup} />
                    <BudgetGroupName
                      budgetGroup={budgetGroup}
                      htmlFor={id}
                      editing={renaming === budgetGroup.key}
                      onEditingChange={(on) => setRenaming(on ? budgetGroup.key : null)}
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
                      setTargets((t) =>
                        clampTarget(t, budgetGroup.key, Number(e.target.value) * 100),
                      )
                    }
                  />
                  <span className="text-right font-mono text-sm tabular-nums">
                    {formatPercent(bps / 10000)}
                  </span>
                  <BudgetGroupMenu
                    budgetGroup={budgetGroup}
                    onRename={() => setRenaming(budgetGroup.key)}
                  />
                </div>
                <p className="text-muted-foreground pl-5.5 text-xs">
                  {budgetGroup.goal === 'minimum' ? 'guardar ao menos' : 'até'}{' '}
                  {formatMoney(Math.round((income * bps) / 10000))} · planejado em{' '}
                  {monthLabel(current.month)} {formatMoney(cell.plannedCents)} (
                  {formatPercent(cell.ratio)}) · até{' '}
                  {formatPercent(maxBpsFor(targets, budgetGroup.key) / 10000)}
                </p>
              </li>
            )
          })}
        </ul>

        {adding ? (
          <NewBudgetGroupRow budgetGroups={budgetGroups} onCancel={() => setAdding(false)} />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="justify-self-start"
            onClick={() => setAdding(true)}
          >
            <Plus /> Novo grupo
          </Button>
        )}

        {archived.length > 0 && (
          <details className="text-sm">
            <summary className="text-muted-foreground cursor-pointer text-xs">
              Arquivados ({archived.length})
            </summary>
            <ul className="mt-2 grid gap-1">
              {archived.map((budgetGroup) => (
                <li key={budgetGroup.key} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span
                      className={cn('size-2.5 rounded-xs', GROUP_DOT_CLASSES[budgetGroup.color])}
                    />
                    {budgetGroup.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      run(() => updateBudgetGroupAction({ key: budgetGroup.key, archived: false }))
                    }
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
          <Button variant="ghost" onClick={() => setTargets(version.targets)} disabled={pending}>
            Desfazer
          </Button>
        )}
        <Button
          disabled={!dirty || pending}
          onClick={() =>
            run(
              () =>
                saveBudgetVersionAction({
                  id: version.id,
                  startsMonth: version.startsMonth,
                  targets,
                }),
              'Metas salvas.',
            )
          }
        >
          {pending && <Loader2 className="animate-spin" />}
          Salvar metas
        </Button>
      </CardFooter>

      {dialog !== null && (
        <VersionStartDialog
          key={dialog}
          open
          onOpenChange={(open) => !open && setDialog(null)}
          mode={dialog}
          version={version}
          versions={sorted}
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
