import type { BudgetMonth } from '@/features/ledger/core/budget'
import { addMonths, type Month } from '@/features/ledger/core/month'
import type { BudgetGroup, BudgetGroupKey, BudgetVersion } from '@/features/ledger/core/types'

/**
 * Goals ("Objetivos"): monthly slices of a `minimum` budget group. Everything
 * is in today's money: projections grow at a real (above-inflation) return.
 * Pure: the page hands in the budget months and account balances.
 */

export type GoalKind = 'emergency' | 'independence' | 'purchase' | 'recurring'
export const GOAL_KINDS = ['emergency', 'independence', 'purchase', 'recurring'] as const

export function isGoalKind(value: string): value is GoalKind {
  return GOAL_KINDS.some((kind) => kind === value)
}

export type Goal = {
  id: string
  name: string
  kind: GoalKind
  budgetGroup: BudgetGroupKey
  /** emergency: override of 6 × essential; independence: desired income per month; else the price. */
  targetCents: number | null
  targetMonth: Month | null
  /** Null for independence (takes what the budget group leaves). */
  monthlyCents: number | null
  initialCents: number
  withdrawalBps: number
  accountId: string | null
  startMonth: Month
  sort: number
}

/** Real return assumed for projections (5% a year above inflation). */
export const REAL_RETURN_YEAR = 0.05
const MONTHLY = (1 + REAL_RETURN_YEAR) ** (1 / 12) - 1
/** Months of essential spending the emergency fund covers. */
export const EMERGENCY_MONTHS = 6
/** How many complete months the averages look at. */
export const AVERAGE_MONTHS = 6
export const ESSENTIAL_GROUP = 'essential'
const HORIZON = 12 * 70

/** Kinds sorted by priority when a budget group's money is split: emergency first, the remainder last. */
const PRIORITY: Record<GoalKind, number> = {
  emergency: 0,
  purchase: 1,
  recurring: 1,
  independence: 2,
}

export function byPriority(goals: readonly Goal[]): Goal[] {
  return [...goals].sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind] || a.sort - b.sort)
}

/** Averages over the last complete months before `current` (months with no income are skipped). */
export type Baseline = {
  incomeCents: number
  essentialCents: number
  /** Every `limit` budget group: the current standard of living. */
  lifestyleCents: number
  months: number
}

export function baseline(
  months: readonly BudgetMonth[],
  groups: readonly Pick<BudgetGroup, 'key' | 'goal'>[],
  current: Month,
): Baseline {
  const window = months
    .filter((m) => m.month < current && m.month >= addMonths(current, -AVERAGE_MONTHS))
    .filter((m) => m.incomeCents > 0)
  const n = window.length
  if (n === 0) return { incomeCents: 0, essentialCents: 0, lifestyleCents: 0, months: 0 }
  const limitKeys = groups.filter((g) => g.goal === 'limit').map((g) => g.key)
  const avg = (pick: (m: BudgetMonth) => number) =>
    Math.round(window.reduce((sum, m) => sum + pick(m), 0) / n)
  const spent = (m: BudgetMonth, key: string) => Math.max(0, m.byBudgetGroup[key] ?? 0)
  return {
    incomeCents: avg((m) => m.incomeCents),
    essentialCents: avg((m) => spent(m, ESSENTIAL_GROUP)),
    lifestyleCents: avg((m) => limitKeys.reduce((s, k) => s + spent(m, k), 0)),
    months: n,
  }
}

/** The budget group's money per month: average income × its target in `version`. */
export function potCents(
  group: BudgetGroupKey,
  version: BudgetVersion | null,
  base: Baseline,
): number {
  const bps = version?.targets[group] ?? 0
  return Math.round((base.incomeCents * bps) / 10000)
}

/**
 * The budget version goals plan with: the latest one, even when it starts after
 * this month (goals look ahead; a version made for next month already counts).
 */
export function planningVersion(versions: readonly BudgetVersion[]): BudgetVersion | null {
  return [...versions].sort((a, b) => a.startsMonth.localeCompare(b.startsMonth)).at(-1) ?? null
}

/** Target in cents (for independence: the capital that pays the income). */
export function targetOf(goal: Goal, base: Baseline): number {
  switch (goal.kind) {
    case 'emergency':
      return goal.targetCents ?? base.essentialCents * EMERGENCY_MONTHS
    case 'independence':
      return capitalFor(goal.targetCents ?? base.lifestyleCents, goal.withdrawalBps)
    default:
      return goal.targetCents ?? 0
  }
}

/** Capital whose withdrawal rate pays `monthlyCents` forever. */
export function capitalFor(monthlyCents: number, withdrawalBps: number): number {
  return Math.round((monthlyCents * 12 * 10000) / withdrawalBps)
}

/** Next due month of a recurring goal on or after `current` (yearly). */
export function nextDue(goal: Goal, current: Month): Month | null {
  if (goal.targetMonth === null) return null
  if (goal.kind !== 'recurring') return goal.targetMonth
  let due = goal.targetMonth
  while (due < current) due = addMonths(due, 12)
  return due
}

/** Whole months from `from` until `to` (0 when `to` is not after `from`). */
export function monthsBetween(from: Month, to: Month): number {
  const index = (m: Month) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7))
  return Math.max(0, index(to) - index(from))
}

/** Monthly deposit that turns `saved` into `target` in `months` (0 when already there). */
export function monthlyNeeded(saved: number, target: number, months: number): number {
  if (saved >= target) return 0
  if (months <= 0) return target - saved
  const growth = (1 + MONTHLY) ** months
  return Math.max(0, Math.ceil(((target - saved * growth) * MONTHLY) / (growth - 1)))
}

/** Months until `saved` + `monthly` deposits reach `target`; null past the horizon. */
export function monthsToReach(saved: number, target: number, monthly: number): number | null {
  let value = saved
  for (let i = 0; i <= HORIZON; i += 1) {
    if (value >= target) return i
    value = value * (1 + MONTHLY) + monthly
  }
  return null
}

/** Slice each goal takes from its budget group per month: the remainder goal gets what is left. */
export function slices(
  goals: readonly Goal[],
  potOf: (group: BudgetGroupKey) => number,
  balances: Record<string, number>,
  base: Baseline,
): Record<string, number> {
  const result: Record<string, number> = {}
  for (const group of new Set(goals.map((g) => g.budgetGroup))) {
    let left = potOf(group)
    for (const goal of byPriority(goals.filter((g) => g.budgetGroup === group))) {
      if (goal.kind === 'independence') {
        result[goal.id] = Math.max(0, left)
        left = 0
        continue
      }
      // A full emergency fund stops taking its slice.
      const full = goal.kind === 'emergency' && (balances[goal.id] ?? 0) >= targetOf(goal, base)
      const slice = full ? 0 : (goal.monthlyCents ?? 0)
      result[goal.id] = slice
      left -= slice
    }
  }
  return result
}

/** What `goal` takes this month from `left` (the group money not yet split). */
function takeFor(goal: Goal, left: number, balance: number, base: Baseline): number {
  if (goal.kind === 'independence') return left
  const slice = Math.min(left, goal.monthlyCents ?? 0)
  if (goal.kind !== 'emergency') return slice
  return Math.min(slice, Math.max(0, targetOf(goal, base) - balance))
}

/** Splits one month's money of every group among its goals, in priority order (mutates `balances`). */
function splitMonth(
  ordered: readonly Goal[],
  month: BudgetMonth,
  balances: Record<string, number>,
  base: Baseline,
): void {
  for (const group of new Set(ordered.map((g) => g.budgetGroup))) {
    let left = Math.max(0, month.byBudgetGroup[group] ?? 0)
    for (const goal of ordered) {
      if (goal.budgetGroup !== group || goal.startMonth > month.month) continue
      const take = takeFor(goal, left, balances[goal.id] ?? 0, base)
      balances[goal.id] = (balances[goal.id] ?? 0) + take
      left -= take
    }
  }
}

export type GoalsInput = {
  goals: readonly Goal[]
  months: readonly BudgetMonth[]
  current: Month
  /** Balance per account now (dedicated accounts win over the envelope). */
  accountBalances: Record<string, number>
  /** Budget version the pots come from ({@link planningVersion}). */
  version: BudgetVersion | null
}

/**
 * Virtual envelopes: each complete month since a goal started, what actually
 * went into its budget group is split in priority order (emergency first, up
 * to its target; then each fixed slice; the remainder goal takes the rest).
 * Goals with a dedicated account take their slice from the split but report
 * the account's balance instead.
 */
export function envelopeBalances(input: GoalsInput, base: Baseline): Record<string, number> {
  const { goals, months, current, accountBalances } = input
  const balances: Record<string, number> = Object.fromEntries(
    goals.map((g) => [g.id, g.initialCents]),
  )
  const ordered = byPriority(goals)
  for (const month of months) {
    if (month.month < current) splitMonth(ordered, month, balances, base)
  }
  for (const goal of goals) {
    const account = goal.accountId === null ? undefined : accountBalances[goal.accountId]
    if (account !== undefined) balances[goal.id] = Math.max(0, account)
  }
  return balances
}

export type GoalStatus = 'done' | 'on_track' | 'tight' | 'late' | 'remainder'

export type GoalPlan = {
  goal: Goal
  savedCents: number
  targetCents: number
  monthlyCents: number
  /** Monthly deposit that meets the due month (null without one). */
  neededCents: number | null
  due: Month | null
  /** Months until the target with the current slice (null past the horizon). */
  etaMonths: number | null
  status: GoalStatus
}

type Amounts = { saved: number; target: number; monthly: number; needed: number | null }

function statusOf(goal: Goal, { saved, target, monthly, needed }: Amounts): GoalStatus {
  if (target > 0 && saved >= target) return 'done'
  if (goal.kind === 'independence') return 'remainder'
  if (needed === null) return monthly > 0 ? 'on_track' : 'late'
  if (monthly >= needed * 0.98) return 'on_track'
  return monthly >= needed * 0.8 ? 'tight' : 'late'
}

export function planGoal(
  goal: Goal,
  money: { saved: number; monthly: number },
  base: Baseline,
  current: Month,
): GoalPlan {
  const { saved, monthly } = money
  const target = targetOf(goal, base)
  const due = nextDue(goal, current)
  const neededCents =
    due === null ? null : monthlyNeeded(saved, target, monthsBetween(current, due))
  return {
    goal,
    savedCents: saved,
    targetCents: target,
    monthlyCents: monthly,
    neededCents,
    due,
    etaMonths: monthsToReach(saved, target, monthly),
    status: statusOf(goal, { saved, target, monthly, needed: neededCents }),
  }
}

export type PotSummary = {
  group: BudgetGroupKey
  potCents: number
  allocatedCents: number
  /** Positive = free in the pot; negative = the slices ask for more than it has. */
  freeCents: number
  plans: GoalPlan[]
}

/** Every goal planned, grouped by budget group (pots in budget order). */
export function summarize(
  input: GoalsInput,
  groups: readonly Pick<BudgetGroup, 'key' | 'goal' | 'sort' | 'archived'>[],
): { base: Baseline; pots: PotSummary[] } {
  const { goals, months, current } = input
  const base = baseline(months, groups, current)
  const balances = envelopeBalances(input, base)
  const sliceOf = slices(goals, (g) => potCents(g, input.version, base), balances, base)
  const pots = [...groups]
    .filter(
      (g) => g.goal === 'minimum' && (!g.archived || goals.some((x) => x.budgetGroup === g.key)),
    )
    .sort((a, b) => a.sort - b.sort)
    .map((group) => {
      const pot = potCents(group.key, input.version, base)
      const own = byPriority(goals.filter((g) => g.budgetGroup === group.key))
      const plans = own.map((g) =>
        planGoal(g, { saved: balances[g.id] ?? 0, monthly: sliceOf[g.id] ?? 0 }, base, current),
      )
      const allocated = own
        .filter((g) => g.kind !== 'independence')
        .reduce((sum, g) => sum + (sliceOf[g.id] ?? 0), 0)
      const hasRemainder = own.some((g) => g.kind === 'independence')
      return {
        group: group.key,
        potCents: pot,
        allocatedCents: hasRemainder ? Math.max(pot, allocated) : allocated,
        freeCents: hasRemainder ? Math.min(0, pot - allocated) : pot - allocated,
        plans,
      }
    })
  return { base, pots }
}
