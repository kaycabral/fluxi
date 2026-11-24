'use client'

import { setPotTargetsAction } from '@/features/ledger/adapters/actions/settings'
import { INITIAL_FORM_STATE } from '@/features/ledger/core/action-result'
import {
  clampTarget,
  freeBps,
  maxBpsFor,
  ratioOf,
  targetsOf,
  trafficLight,
  type Light,
  type Targets,
} from '@/features/ledger/core/budget'
import { formatMoney, formatPercent, monthLabel } from '@/features/ledger/core/format'
import { POT_COLORS, POT_LABELS } from '@/features/ledger/core/labels'
import type { Month } from '@/features/ledger/core/month'
import { POT_KEYS, type BudgetPot, type PotKey } from '@/features/ledger/core/types'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  cn,
} from '@cbrl/design'
import { Loader2 } from 'lucide-react'
import { useActionState, useEffect, useState } from 'react'
import { toast } from 'sonner'

export type BudgetMonthSummary = {
  month: Month
  incomeCents: number
  byPot: Record<PotKey, number>
}

const LIGHT_CLASSES: Record<Light, string> = {
  good: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  warn: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
  bad: 'bg-destructive/15 text-destructive',
}

const LIGHT_LABELS: Record<Light, string> = {
  good: 'dentro da meta',
  warn: 'perto da meta',
  bad: 'fora da meta',
}

/** "Orçamento": pot sliders that never pass 100% and the monthly traffic light. */
export function BudgetView({ pots, months }: { pots: BudgetPot[]; months: BudgetMonthSummary[] }) {
  const saved = targetsOf(pots)
  const [targets, setTargets] = useState<Targets>(saved)
  const [state, action, pending] = useActionState(setPotTargetsAction, INITIAL_FORM_STATE)
  const free = freeBps(targets)
  const dirty = POT_KEYS.some((key) => targets[key] !== saved[key])
  const first = months[0]

  useEffect(() => {
    if (state.error !== null) toast.error(state.error)
    else if (state.savedAt > 0) toast.success('Metas salvas.')
  }, [state])

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle asChild>
            <h2>Potes da renda</h2>
          </CardTitle>
          <Badge
            variant="secondary"
            className={free > 0 ? LIGHT_CLASSES.warn : LIGHT_CLASSES.good}
            aria-live="polite"
          >
            {free > 0 ? `${formatPercent(free / 10000)} livre para distribuir` : '100% distribuído'}
          </Badge>
        </CardHeader>
        <CardContent>
          <form action={action} className="grid gap-4">
            <p className="text-muted-foreground text-sm">
              Cada pote recebe uma fatia da renda que entra nas contas de dinheiro disponível
              (benefícios ficam de fora). A soma não passa de 100%: para aumentar um, reduza outro
              antes.
            </p>
            <div className="bg-muted flex h-3.5 overflow-hidden rounded" aria-hidden>
              {POT_KEYS.map((key) => (
                <span
                  key={key}
                  className={POT_COLORS[key]}
                  style={{ width: `${targets[key] / 100}%` }}
                />
              ))}
            </div>
            {POT_KEYS.map((key) => {
              const max = maxBpsFor(targets, key)
              const planned = first?.byPot[key] ?? 0
              const income = first?.incomeCents ?? 0
              return (
                <div key={key} className="grid gap-1">
                  <input type="hidden" name={key} value={targets[key]} />
                  <div className="grid grid-cols-[6rem_1fr_3rem] items-center gap-3 sm:grid-cols-[8rem_1fr_3.5rem]">
                    <label htmlFor={`pot-${key}`} className="flex items-center gap-2 text-sm">
                      <span className={cn('size-2.5 rounded-xs', POT_COLORS[key])} aria-hidden />
                      {POT_LABELS[key]}
                    </label>
                    <input
                      id={`pot-${key}`}
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={Math.round(targets[key] / 100)}
                      aria-valuetext={formatPercent(targets[key] / 10000)}
                      className="accent-primary w-full"
                      onChange={(e) =>
                        setTargets((t) => clampTarget(t, key, Number(e.target.value) * 100))
                      }
                    />
                    <span className="text-right font-mono text-sm tabular-nums">
                      {formatPercent(targets[key] / 10000)}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-xs sm:pl-[9.5rem]">
                    meta {formatMoney(Math.round((income * targets[key]) / 10000))} · planejado
                    {first === undefined ? '' : ` em ${monthLabel(first.month)}`}{' '}
                    {formatMoney(planned)} ({formatPercent(ratioOf(planned, income))}) · até{' '}
                    {formatPercent(max / 10000)}
                  </p>
                </div>
              )
            })}
            <div className="flex justify-end gap-2">
              {dirty && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setTargets(saved)}
                  disabled={pending}
                >
                  Desfazer
                </Button>
              )}
              <Button type="submit" disabled={!dirty || pending}>
                {pending && <Loader2 className="animate-spin" />}
                Salvar metas
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle asChild>
            <h2>Semáforo mensal</h2>
          </CardTitle>
          <CardDescription>
            Planejado ÷ renda disponível do mês; gastos pagos com benefícios não entram. Verde
            dentro da meta, amarelo até 20% fora, vermelho além disso.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="bg-card sticky left-0 px-2 py-1.5 text-left font-medium">Pote</th>
                <th className="px-2 py-1.5 text-right font-medium">Meta</th>
                {months.map((m) => (
                  <th
                    key={m.month}
                    className="px-2 py-1.5 text-right font-medium whitespace-nowrap"
                  >
                    {monthLabel(m.month)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {POT_KEYS.map((key) => (
                <tr key={key} className="border-b">
                  <td className="bg-card sticky left-0 px-2 py-1.5 whitespace-nowrap">
                    <span
                      className={cn('mr-2 inline-block size-2.5 rounded-xs', POT_COLORS[key])}
                      aria-hidden
                    />
                    {POT_LABELS[key]}
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                    {formatPercent(targets[key] / 10000)}
                  </td>
                  {months.map((m) => {
                    const ratio = ratioOf(m.byPot[key], m.incomeCents)
                    const light = trafficLight(key, ratio, targets[key] / 10000)
                    return (
                      <td key={m.month} className="px-1 py-1.5 text-right">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 font-mono text-xs tabular-nums',
                            LIGHT_CLASSES[light],
                          )}
                          title={LIGHT_LABELS[light]}
                        >
                          {formatPercent(ratio)}
                          <span className="sr-only"> ({LIGHT_LABELS[light]})</span>
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
