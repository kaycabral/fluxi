import type { BudgetMonth } from '@/features/ledger/core/budget'
import { describe, expect, it } from 'vitest'
import {
  baseline,
  capitalFor,
  envelopeBalances,
  isGoalKind,
  monthlyNeeded,
  monthsBetween,
  monthsToReach,
  nextDue,
  planGoal,
  planningVersion,
  summarize,
  type Goal,
} from './goals'

const groups = [
  { key: 'essential', goal: 'limit' as const, sort: 0, archived: false },
  { key: 'guilt_free', goal: 'limit' as const, sort: 1, archived: false },
  { key: 'investment', goal: 'minimum' as const, sort: 2, archived: false },
  { key: 'goals', goal: 'minimum' as const, sort: 3, archived: false },
]
const version = {
  id: 'v1',
  startsMonth: '2026-01',
  targets: { essential: 5000, guilt_free: 2500, investment: 2500, goals: 0 },
}
const month = (m: string, invest = 250_000, goalsSpent = 0): BudgetMonth => ({
  month: m,
  incomeCents: 1_000_000,
  byBudgetGroup: { essential: 400_000, guilt_free: 200_000, investment: invest, goals: goalsSpent },
  version,
})
const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'].map(
  (m) => month(m),
)

const goal = (over: Partial<Goal>): Goal => ({
  id: 'g',
  name: 'Objetivo',
  kind: 'purchase',
  budgetGroup: 'goals',
  targetCents: null,
  targetMonth: null,
  monthlyCents: null,
  initialCents: 0,
  withdrawalBps: 400,
  accountId: null,
  startMonth: '2026-05',
  sort: 0,
  ...over,
})

describe('goal math', () => {
  it('averages the complete months before the current one', () => {
    const base = baseline(months, groups, '2026-11')
    expect(base).toEqual({
      incomeCents: 1_000_000,
      essentialCents: 400_000,
      lifestyleCents: 600_000,
      months: 6,
    })
  })

  it('needs no growth math when there is nothing to grow', () => {
    expect(monthlyNeeded(0, 120_000, 0)).toBe(120_000)
    expect(monthlyNeeded(200, 100, 12)).toBe(0)
    // 12 deposits growing 5%/year real need a bit less than target ÷ 12.
    const need = monthlyNeeded(0, 1_200_000, 12)
    expect(need).toBeLessThan(100_000)
    expect(need).toBeGreaterThan(97_000)
    expect(monthsToReach(0, 1_200_000, need)).toBe(12)
  })

  it('counts months and rolls a recurring goal to its next year', () => {
    expect(monthsBetween('2026-11', '2027-04')).toBe(5)
    expect(monthsBetween('2027-04', '2026-11')).toBe(0)
    const trip = goal({ kind: 'recurring', targetMonth: '2026-04', targetCents: 1 })
    expect(nextDue(trip, '2026-11')).toBe('2027-04')
  })

  it('turns the desired income into capital by the withdrawal rate', () => {
    expect(capitalFor(900_000, 400)).toBe(270_000_000)
  })
})

describe('envelopes', () => {
  it('fills the emergency fund first, up to 6 × essential, and gives the rest to independence', () => {
    const base = baseline(months, groups, '2026-11')
    const emergency = goal({
      id: 'e',
      kind: 'emergency',
      budgetGroup: 'investment',
      monthlyCents: 100_000,
      initialCents: 2_200_000,
    })
    const fi = goal({ id: 'f', kind: 'independence', budgetGroup: 'investment' })
    const balances = envelopeBalances(
      { goals: [fi, emergency], months, current: '2026-11', accountBalances: {}, version },
      base,
    )
    // Target 2.4M: 2.2M + 100k + 100k, then full; independence takes the other 250k × 6 − 200k.
    expect(balances.e).toBe(2_400_000)
    expect(balances.f).toBe(250_000 * 6 - 200_000)
  })

  it('prefers a dedicated account balance', () => {
    const base = baseline(months, groups, '2026-11')
    const car = goal({ id: 'c', accountId: 'acc', targetCents: 1, targetMonth: '2028-01' })
    expect(
      envelopeBalances(
        { goals: [car], months, current: '2026-11', accountBalances: { acc: 5_000 }, version },
        base,
      ).c,
    ).toBe(5_000)
  })
})

describe('plans', () => {
  it('flags a slice too small for the due month', () => {
    const base = baseline(months, groups, '2026-11')
    const car = goal({ targetCents: 1_200_000, targetMonth: '2027-11', monthlyCents: 50_000 })
    const plan = planGoal(car, { saved: 0, monthly: 50_000 }, base, '2026-11')
    expect(plan.status).toBe('late')
    expect(plan.neededCents).toBeGreaterThan(90_000)
  })

  it('summarizes the pots: free room in Metas, the remainder in Investimento', () => {
    const v2 = { ...version, targets: { ...version.targets, guilt_free: 1500, goals: 1000 } }
    const ms = months.map((m) => ({ ...m, version: v2 }))
    const goals = [
      goal({ id: 'f', kind: 'independence', budgetGroup: 'investment' }),
      goal({
        id: 't',
        kind: 'recurring',
        targetCents: 1_200_000,
        targetMonth: '2027-04',
        monthlyCents: 40_000,
      }),
    ]
    const { pots } = summarize(
      { goals, months: ms, current: '2026-11', accountBalances: {}, version: v2 },
      groups,
    )
    const [investment, metas] = pots
    expect(investment?.potCents).toBe(250_000)
    expect(investment?.freeCents).toBe(0)
    expect(investment?.plans[0]?.monthlyCents).toBe(250_000)
    expect(metas?.potCents).toBe(100_000)
    expect(metas?.freeCents).toBe(60_000)
  })
})

describe('edges', () => {
  it('has no baseline without complete months of income', () => {
    expect(baseline([], groups, '2026-11').months).toBe(0)
  })

  it('uses an explicit emergency target and stops a full fund taking its slice', () => {
    const base = baseline(months, groups, '2026-11')
    const emergency = goal({
      id: 'e',
      kind: 'emergency',
      budgetGroup: 'investment',
      targetCents: 100,
      initialCents: 100,
      monthlyCents: 5,
    })
    const input = { goals: [emergency], months, current: '2026-11', accountBalances: {}, version }
    const { pots } = summarize(input, groups)
    expect(pots[0]?.plans[0]).toMatchObject({ status: 'done', monthlyCents: 0, targetCents: 100 })
    expect(planGoal(emergency, { saved: 0, monthly: 0 }, base, '2026-11').status).toBe('late')
    expect(planGoal(emergency, { saved: 0, monthly: 5 }, base, '2026-11').status).toBe('on_track')
  })

  it('grades a slice as tight between 80% and 98% of what is needed', () => {
    const base = baseline(months, groups, '2026-11')
    const car = goal({ targetCents: 1_200_000, targetMonth: '2027-11', monthlyCents: 1 })
    const needed = planGoal(car, { saved: 0, monthly: 0 }, base, '2026-11').neededCents ?? 0
    const tight = planGoal(car, { saved: 0, monthly: Math.round(needed * 0.9) }, base, '2026-11')
    expect(tight.status).toBe('tight')
    expect(nextDue(goal({}), '2026-11')).toBeNull()
    expect(monthsToReach(0, 1, 0)).toBeNull()
  })

  it('keeps an archived budget group only while a goal still uses it', () => {
    const archived = groups.map((g) => (g.key === 'goals' ? { ...g, archived: true } : g))
    const input = { goals: [], months, current: '2026-11', accountBalances: {}, version }
    expect(summarize(input, archived).pots.map((p) => p.group)).toEqual(['investment'])
  })
})

describe('priority', () => {
  it('splits goals of the same priority in the user order', () => {
    const v2 = { ...version, targets: { ...version.targets, goals: 1000 } }
    const car = goal({ id: 'c', targetCents: 1, targetMonth: '2027-01', monthlyCents: 1, sort: 1 })
    const trip = goal({ id: 't', targetCents: 1, targetMonth: '2027-01', monthlyCents: 1, sort: 0 })
    const input = {
      goals: [car, trip],
      months,
      current: '2026-11',
      accountBalances: {},
      version: v2,
    }
    expect(summarize(input, groups).pots[1]?.plans.map((p) => p.goal.id)).toEqual(['t', 'c'])
  })
})

describe('isGoalKind', () => {
  it('accepts only the four kinds', () => {
    expect(isGoalKind('recurring')).toBe(true)
    expect(isGoalKind('dividends')).toBe(false)
  })
})

describe('planningVersion', () => {
  it('plans with the latest version, even one starting next month', () => {
    const next = { ...version, id: 'v2', startsMonth: '2026-12' }
    expect(planningVersion([next, version])?.id).toBe('v2')
    expect(planningVersion([])).toBeNull()
  })
})
