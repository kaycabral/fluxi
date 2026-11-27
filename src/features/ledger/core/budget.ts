import { addMonths, type Month } from './month'
import type { MonthTotals } from './projection'
import {
  GROUP_COLORS,
  type BudgetGroup,
  type BudgetGroupColor,
  type BudgetGroupGoal,
  type BudgetGroupKey,
  type BudgetVersion,
} from './types'

/**
 * Budget: budget groups with targets in basis points of the month's income
 * (10000 = 100%), grouped in versions ({@link BudgetVersion}) so a change of
 * proportions (rent, a raise, a child) never repaints the months before it.
 */

export type Targets = Record<BudgetGroupKey, number>

export function totalBps(targets: Targets): number {
  return Object.values(targets).reduce((sum, bps) => sum + bps, 0)
}

/** What is still undistributed (never negative). */
export function freeBps(targets: Targets): number {
  return Math.max(0, 10000 - totalBps(targets))
}

/** Highest value `key` may take given the others (the sum never passes 100%). */
export function maxBpsFor(targets: Targets, key: BudgetGroupKey): number {
  return Math.max(0, 10000 - (totalBps(targets) - (targets[key] ?? 0)))
}

/** Set `key` to `bps`, clamped to [0, what the other budget groups leave]. */
export function clampTarget(targets: Targets, key: BudgetGroupKey, bps: number): Targets {
  const value = Math.round(Math.min(Math.max(0, bps), maxBpsFor(targets, key)))
  return { ...targets, [key]: value }
}

/** Same targets, ignoring keys at 0 (a missing key is 0%). */
export function sameTargets(a: Targets, b: Targets): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  return [...keys].every((key) => (a[key] ?? 0) === (b[key] ?? 0))
}

/** Versions by start month, oldest first. */
export function sortVersions(versions: readonly BudgetVersion[]): BudgetVersion[] {
  return [...versions].sort((a, b) => a.startsMonth.localeCompare(b.startsMonth))
}

/** The version in force in `month`: the latest one starting at or before it; null before the first. */
export function versionFor(month: Month, versions: readonly BudgetVersion[]): BudgetVersion | null {
  let found: BudgetVersion | null = null
  for (const version of sortVersions(versions)) {
    if (version.startsMonth <= month) found = version
  }
  return found
}

/** Last month a version is in force (the month before the next one), null when open-ended. */
export function versionEnd(
  version: BudgetVersion,
  versions: readonly BudgetVersion[],
): Month | null {
  const next = sortVersions(versions).find((p) => p.startsMonth > version.startsMonth)
  return next === undefined ? null : addMonths(next.startsMonth, -1)
}

export type Light = 'good' | 'warn' | 'bad'

/**
 * Share of income vs the target: for a `limit` budget group green within the target,
 * yellow up to 20% over, red beyond; a `minimum` budget group is inverted (more is better).
 */
export function trafficLight(
  goal: BudgetGroupGoal,
  actualRatio: number,
  targetRatio: number,
): Light {
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
  byBudgetGroup: Record<BudgetGroupKey, number>
  /** The version in force; null before the first one (no target, no light). */
  version: BudgetVersion | null
}

/** What the budget groups measure in each month: every account's income and expenses per budget group. */
export function budgetMonths(
  results: readonly { month: Month; totals: Pick<MonthTotals, 'incomeCents' | 'byBudgetGroup'> }[],
  versions: readonly BudgetVersion[],
): BudgetMonth[] {
  return results.map(({ month, totals }) => ({
    month,
    incomeCents: totals.incomeCents,
    byBudgetGroup: totals.byBudgetGroup,
    version: versionFor(month, versions),
  }))
}

export type BudgetGroupCell = {
  plannedCents: number
  ratio: number
  /** Null when no version covers the month. */
  targetBps: number | null
  targetCents: number | null
  /** Null when no version covers the month or it has no income (nothing to measure against). */
  light: Light | null
}

/** A month with no income has no share to measure: its cells show "–" and get no light. */
export function hasIncome(month: Pick<BudgetMonth, 'incomeCents'>): boolean {
  return month.incomeCents > 0
}

/** One budget group in one month: planned spending, its share of income and the light against the version. */
export function budgetGroupCell(
  budgetGroup: Pick<BudgetGroup, 'key' | 'goal'>,
  month: BudgetMonth,
): BudgetGroupCell {
  // Refunds can take a budget group below zero in the totals; the cell shows it as nothing spent.
  const plannedCents = Math.max(0, month.byBudgetGroup[budgetGroup.key] ?? 0)
  const ratio = ratioOf(plannedCents, month.incomeCents)
  if (month.version === null) {
    return { plannedCents, ratio, targetBps: null, targetCents: null, light: null }
  }
  const targetBps = month.version.targets[budgetGroup.key] ?? 0
  return {
    plannedCents,
    ratio,
    targetBps,
    targetCents: Math.round((month.incomeCents * targetBps) / 10000),
    light: hasIncome(month) ? trafficLight(budgetGroup.goal, ratio, targetBps / 10000) : null,
  }
}

/**
 * Budget groups worth a row over `months`: the active ones plus archived budget groups that
 * still have a target or spending there, in the user's order.
 */
export function visibleBudgetGroups(
  budgetGroups: readonly BudgetGroup[],
  months: readonly BudgetMonth[],
): BudgetGroup[] {
  return [...budgetGroups]
    .sort((a, b) => a.sort - b.sort)
    .filter(
      (budgetGroup) =>
        !budgetGroup.archived ||
        months.some(
          (m) =>
            (m.byBudgetGroup[budgetGroup.key] ?? 0) > 0 ||
            (m.version?.targets[budgetGroup.key] ?? 0) > 0,
        ),
    )
}

/** Count of each light in a month, over the budget groups given (months without a version count nothing). */
export function lightSummary(
  budgetGroups: readonly Pick<BudgetGroup, 'key' | 'goal'>[],
  month: BudgetMonth,
): Record<Light, number> {
  const summary: Record<Light, number> = { good: 0, warn: 0, bad: 0 }
  for (const budgetGroup of budgetGroups) {
    const { light } = budgetGroupCell(budgetGroup, month)
    if (light !== null) summary[light] += 1
  }
  return summary
}

/** First palette color no budget group uses yet (cycles when all are taken). */
export function nextBudgetGroupColor(
  budgetGroups: readonly Pick<BudgetGroup, 'color'>[],
): BudgetGroupColor {
  const used = new Set(budgetGroups.map((p) => p.color))
  return (
    GROUP_COLORS.find((color) => !used.has(color)) ??
    GROUP_COLORS[budgetGroups.length % GROUP_COLORS.length] ??
    'slate'
  )
}

/** Key for a new budget group: `p_` + 10 base-36 chars from `random` (unique enough per user). */
export function newBudgetGroupKey(random: () => number = Math.random): BudgetGroupKey {
  let suffix = ''
  for (let i = 0; i < 10; i += 1) suffix += Math.floor(random() * 36).toString(36)
  return `p_${suffix}`
}
