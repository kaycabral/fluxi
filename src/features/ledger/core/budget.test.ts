import { describe, expect, it } from 'vitest'
import {
  budgetGroupCell,
  budgetMonths,
  clampTarget,
  freeBps,
  hasIncome,
  lightSummary,
  maxBpsFor,
  newBudgetGroupKey,
  nextBudgetGroupColor,
  ratioOf,
  sameTargets,
  totalBps,
  trafficLight,
  versionEnd,
  versionFor,
  visibleBudgetGroups,
  type BudgetMonth,
} from './budget'
import { DEFAULT_BUDGET_GROUPS } from './defaults'
import { makeEntry } from './fixtures'
import { projectMonths } from './projection'
import type { BudgetGroup, BudgetVersion } from './types'

// A six-group, 90% budget (independent of today's defaults).
const LEGACY_GROUPS = [
  ...DEFAULT_BUDGET_GROUPS.slice(0, 4),
  { key: 'variable', name: 'Variável', color: 'yellow', goal: 'limit', targetBps: 800 },
  { ...DEFAULT_BUDGET_GROUPS[4]! },
] as const
const targets: Record<string, number> = {
  essential: 3300,
  comfort: 700,
  guilt_free: 700,
  education: 300,
  variable: 800,
  investment: 3200,
}

const budgetGroups: BudgetGroup[] = LEGACY_GROUPS.map(({ key, name, color, goal }, sort) => ({
  key,
  name,
  color,
  goal,
  sort,
  archived: false,
}))

const OLD: BudgetVersion = { id: 'old', startsMonth: '2025-01', targets: { essential: 5000 } }
const NEW: BudgetVersion = { id: 'new', startsMonth: '2026-12', targets }

describe('targets', () => {
  it('sums and leaves the rest free', () => {
    expect(totalBps(targets)).toBe(9000)
    expect(freeBps(targets)).toBe(1000)
    expect(freeBps({ a: 6000, b: 6000 })).toBe(0)
  })

  it('never lets the sum pass 100%, also for a key not set yet', () => {
    expect(maxBpsFor(targets, 'comfort')).toBe(1700)
    expect(clampTarget(targets, 'comfort', 5000).comfort).toBe(1700)
    const lowered = clampTarget(targets, 'essential', 3000)
    expect(freeBps(lowered)).toBe(1300)
    expect(clampTarget(lowered, 'comfort', 5000).comfort).toBe(2000)
    expect(clampTarget(lowered, 'comfort', -5).comfort).toBe(0)
    expect(clampTarget(targets, 'p_new', 5000).p_new).toBe(1000)
  })

  it('compares targets treating a missing key as 0%', () => {
    expect(sameTargets({ a: 100, b: 0 }, { a: 100 })).toBe(true)
    expect(sameTargets({ a: 100 }, { a: 200 })).toBe(false)
  })
})

describe('budget versions', () => {
  it('finds the version in force in a month, none before the first', () => {
    expect(versionFor('2024-12', [NEW, OLD])).toBeNull()
    expect(versionFor('2025-01', [NEW, OLD])?.id).toBe('old')
    expect(versionFor('2026-11', [NEW, OLD])?.id).toBe('old')
    expect(versionFor('2026-12', [NEW, OLD])?.id).toBe('new')
    expect(versionFor('2030-01', [NEW, OLD])?.id).toBe('new')
  })

  it('ends a version the month before the next one starts', () => {
    expect(versionEnd(OLD, [NEW, OLD])).toBe('2026-11')
    expect(versionEnd(NEW, [NEW, OLD])).toBeNull()
  })
})

describe('traffic light', () => {
  it('colors a limit budget group by how far it goes over, a minimum budget group by how far it falls short', () => {
    expect(trafficLight('limit', 0.3, 0.33)).toBe('good')
    expect(trafficLight('limit', 0.38, 0.33)).toBe('warn')
    expect(trafficLight('limit', 0.5, 0.33)).toBe('bad')
    expect(trafficLight('minimum', 0.35, 0.32)).toBe('good')
    expect(trafficLight('minimum', 0.27, 0.32)).toBe('warn')
    expect(trafficLight('minimum', 0.1, 0.32)).toBe('bad')
  })

  it('computes ratios safely', () => {
    expect(ratioOf(50, 200)).toBe(0.25)
    expect(ratioOf(50, 0)).toBe(0)
  })
})

describe('budgetMonths', () => {
  const results = projectMonths({
    entries: [
      makeEntry({
        id: 'salary',
        kind: 'income',
        budgetGroup: null,
        amountCents: 1000000,
        startMonth: '2026-11',
      }),
      makeEntry({
        id: 'rent',
        budgetGroup: 'essential',
        amountCents: -400000,
        startMonth: '2026-11',
      }),
      makeEntry({
        id: 'voucher',
        kind: 'income',
        budgetGroup: null,
        accountId: 'va',
        amountCents: 100000,
        startMonth: '2026-11',
      }),
      makeEntry({
        id: 'groceries',
        budgetGroup: 'essential',
        accountId: 'va',
        amountCents: -100000,
        startMonth: '2026-11',
      }),
    ],
    parts: [],
    overrides: [],
    accounts: [
      { id: 'checking', openingBalanceCents: 0 },
      { id: 'va', openingBalanceCents: 0 },
    ],
    months: ['2024-12', '2026-11', '2026-12'],
  })
  const months = budgetMonths(results, [OLD, NEW])
  const monthAt = (index: number): BudgetMonth => {
    const month = months[index]
    if (month === undefined) throw new Error('no month')
    return month
  }
  const [before, november, december] = [monthAt(0), monthAt(1), monthAt(2)]

  it('measures every account, benefit ones included', () => {
    expect(december).toMatchObject({ month: '2026-12', incomeCents: 1100000 })
    expect(december.byBudgetGroup.essential).toBe(500000)
  })

  it('judges each month by its own version, and leaves months before the first without a light', () => {
    const essential = { key: 'essential', goal: 'limit' } as const
    // 500k of 1.1M = 45%: within the old 50%, way over the new 33%.
    expect(budgetGroupCell(essential, november)).toMatchObject({ targetBps: 5000, light: 'good' })
    expect(budgetGroupCell(essential, december)).toMatchObject({
      targetBps: 3300,
      targetCents: 363000,
      light: 'bad',
    })
    expect(budgetGroupCell(essential, before)).toMatchObject({ targetBps: null, light: null })
    // A budget group the version leaves out has a 0% target.
    expect(budgetGroupCell({ key: 'comfort', goal: 'limit' }, november).targetBps).toBe(0)
  })

  it('gives no light to a month with no income, and leaves it out of the summary', () => {
    const noIncome: BudgetMonth = { ...december, incomeCents: 0 }
    const minimum = { key: 'investment', goal: 'minimum' } as const
    expect(hasIncome(noIncome)).toBe(false)
    expect(hasIncome(december)).toBe(true)
    expect(budgetGroupCell(minimum, noIncome).light).toBeNull()
    expect(lightSummary(budgetGroups, noIncome)).toEqual({ good: 0, warn: 0, bad: 0 })
  })

  it('shows a budget group that refunds took below zero as nothing spent', () => {
    const refunded: BudgetMonth = { ...december, byBudgetGroup: { essential: -5000 } }
    expect(budgetGroupCell({ key: 'essential', goal: 'limit' }, refunded)).toMatchObject({
      plannedCents: 0,
      ratio: 0,
      light: 'good',
    })
  })

  it('summarizes the lights of a month', () => {
    expect(lightSummary(budgetGroups, december)).toEqual({ good: 4, warn: 0, bad: 2 })
    expect(lightSummary(budgetGroups, before)).toEqual({ good: 0, warn: 0, bad: 0 })
  })

  it('shows archived budget groups only while they still have a target or spending', () => {
    const archived = budgetGroups.map((p) =>
      p.key === 'comfort' || p.key === 'essential' ? { ...p, archived: true } : p,
    )
    const shown = visibleBudgetGroups(archived, [december]).map((p) => p.key)
    expect(shown).toContain('essential')
    // Still has a 7% target in the new version.
    expect(shown).toContain('comfort')
    expect(visibleBudgetGroups(archived, [november]).map((p) => p.key)).not.toContain('comfort')
  })
})

describe('new budget groups', () => {
  it('takes the first unused color, cycling when all are taken', () => {
    expect(nextBudgetGroupColor(budgetGroups)).toBe('sky')
    expect(nextBudgetGroupColor([])).toBe('violet')
  })

  it('makes keys the database accepts', () => {
    expect(newBudgetGroupKey(() => 0.5)).toMatch(/^p_[a-z0-9]{10}$/)
    expect(newBudgetGroupKey()).toMatch(/^[a-z0-9_]{1,40}$/)
  })
})
