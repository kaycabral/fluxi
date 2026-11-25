import { addMonths, type Month } from './month'
import type { MonthTotals } from './projection'
import {
  POT_COLORS,
  type BudgetPlan,
  type Pot,
  type PotColor,
  type PotGoal,
  type PotKey,
} from './types'

/**
 * Budget: pots with targets in basis points of the month's income
 * (10000 = 100%), grouped in versions ({@link BudgetPlan}) so a change of
 * proportions (rent, a raise, a child) never repaints the months before it.
 */

export type Targets = Record<PotKey, number>

export function totalBps(targets: Targets): number {
  return Object.values(targets).reduce((sum, bps) => sum + bps, 0)
}

/** What is still undistributed (never negative). */
export function freeBps(targets: Targets): number {
  return Math.max(0, 10000 - totalBps(targets))
}

/** Highest value `key` may take given the others (the sum never passes 100%). */
export function maxBpsFor(targets: Targets, key: PotKey): number {
  return Math.max(0, 10000 - (totalBps(targets) - (targets[key] ?? 0)))
}

/** Set `key` to `bps`, clamped to [0, what the other pots leave]. */
export function clampTarget(targets: Targets, key: PotKey, bps: number): Targets {
  const value = Math.round(Math.min(Math.max(0, bps), maxBpsFor(targets, key)))
  return { ...targets, [key]: value }
}

/** Same targets, ignoring keys at 0 (a missing key is 0%). */
export function sameTargets(a: Targets, b: Targets): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...keys].every((key) => (a[key] ?? 0) === (b[key] ?? 0))
}

/** Plans by start month, oldest first. */
export function sortPlans(plans: readonly BudgetPlan[]): BudgetPlan[] {
  return [...plans].sort((a, b) => a.startsMonth.localeCompare(b.startsMonth))
}

/** The plan in force in `month`: the latest one starting at or before it; null before the first. */
export function planFor(month: Month, plans: readonly BudgetPlan[]): BudgetPlan | null {
  let found: BudgetPlan | null = null
  for (const plan of sortPlans(plans)) {
    if (plan.startsMonth <= month) found = plan
  }
  return found
}

/** Last month a plan is in force (the month before the next one), null when open-ended. */
export function planEnd(plan: BudgetPlan, plans: readonly BudgetPlan[]): Month | null {
  const next = sortPlans(plans).find((p) => p.startsMonth > plan.startsMonth)
  return next === undefined ? null : addMonths(next.startsMonth, -1)
}

export type Light = 'good' | 'warn' | 'bad'

/**
 * Share of income vs the target: for a `limit` pot green within the target,
 * yellow up to 20% over, red beyond; a `minimum` pot is inverted (more is better).
 */
export function trafficLight(goal: PotGoal, actualRatio: number, targetRatio: number): Light {
  if (goal === 'minimum') {
    if (actualRatio >= targetRatio) return 'good'
    return actualRatio >= targetRatio * 0.8 ? 'warn' : 'bad'
  }
  if (actualRatio <= targetRatio) return 'good'
  return actualRatio <= targetRatio * 1.2 ? 'warn' : 'bad'
}

/** Share of `incomeCents` (0 without income). */
export function ratioOf(cents: number, incomeCents: number): number {
  return incomeCents > 0 ? cents / incomeCents : 0
}

export type BudgetMonth = {
  month: Month
  incomeCents: number
  byPot: Record<PotKey, number>
  /** The version in force; null before the first one (no target, no light). */
  plan: BudgetPlan | null
}

/** What the pots measure in each month: every account's income and expenses per pot. */
export function budgetMonths(
  results: readonly { month: Month; totals: Pick<MonthTotals, 'incomeCents' | 'byPot'> }[],
  plans: readonly BudgetPlan[],
): BudgetMonth[] {
  return results.map(({ month, totals }) => ({
    month,
    incomeCents: totals.incomeCents,
    byPot: totals.byPot,
    plan: planFor(month, plans),
  }))
}

export type PotCell = {
  plannedCents: number
  ratio: number
  /** Null when no plan covers the month. */
  targetBps: number | null
  targetCents: number | null
  light: Light | null
}

/** One pot in one month: planned spending, its share of income and the light against the plan. */
export function potCell(pot: Pick<Pot, 'key' | 'goal'>, month: BudgetMonth): PotCell {
  // Refunds can take a pot below zero in the totals; the cell shows it as nothing spent.
  const plannedCents = Math.max(0, month.byPot[pot.key] ?? 0)
  const ratio = ratioOf(plannedCents, month.incomeCents)
  if (month.plan === null) {
    return { plannedCents, ratio, targetBps: null, targetCents: null, light: null }
  }
  const targetBps = month.plan.targets[pot.key] ?? 0
  return {
    plannedCents,
    ratio,
    targetBps,
    targetCents: Math.round((month.incomeCents * targetBps) / 10000),
    light: trafficLight(pot.goal, ratio, targetBps / 10000),
  }
}

/**
 * Pots worth a row over `months`: the active ones plus archived pots that
 * still have a target or spending there, in the user's order.
 */
export function visiblePots(pots: readonly Pot[], months: readonly BudgetMonth[]): Pot[] {
  return [...pots]
    .sort((a, b) => a.sort - b.sort)
    .filter(
      (pot) =>
        !pot.archived ||
        months.some((m) => (m.byPot[pot.key] ?? 0) > 0 || (m.plan?.targets[pot.key] ?? 0) > 0),
    )
}

/** Count of each light in a month, over the pots given (months without a plan count nothing). */
export function lightSummary(
  pots: readonly Pick<Pot, 'key' | 'goal'>[],
  month: BudgetMonth,
): Record<Light, number> {
  const summary: Record<Light, number> = { good: 0, warn: 0, bad: 0 }
  for (const pot of pots) {
    const { light } = potCell(pot, month)
    if (light !== null) summary[light] += 1
  }
  return summary
}

/** First palette color no pot uses yet (cycles when all are taken). */
export function nextPotColor(pots: readonly Pick<Pot, 'color'>[]): PotColor {
  const used = new Set(pots.map((p) => p.color))
  return (
    POT_COLORS.find((color) => !used.has(color)) ??
    POT_COLORS[pots.length % POT_COLORS.length] ??
    'slate'
  )
}

/** Key for a new pot: `p_` + 10 base-36 chars from `random` (unique enough per user). */
export function newPotKey(random: () => number = Math.random): PotKey {
  let suffix = ''
  for (let i = 0; i < 10; i += 1) suffix += Math.floor(random() * 36).toString(36)
  return `p_${suffix}`
}
