import { describe, expect, it } from 'vitest'
import {
  budgetMonths,
  clampTarget,
  freeBps,
  lightSummary,
  maxBpsFor,
  newPotKey,
  nextPotColor,
  planEnd,
  planFor,
  potCell,
  ratioOf,
  sameTargets,
  totalBps,
  trafficLight,
  visiblePots,
  type BudgetMonth,
} from './budget'
import { DEFAULT_POTS } from './defaults'
import { makeEntry } from './fixtures'
import { projectMonths } from './projection'
import type { BudgetPlan, Pot } from './types'

const targets = Object.fromEntries(DEFAULT_POTS.map((p) => [p.key, p.targetBps]))

const pots: Pot[] = DEFAULT_POTS.map(({ key, name, color, goal }, sort) => ({
  key,
  name,
  color,
  goal,
  sort,
  archived: false,
}))

const OLD: BudgetPlan = { id: 'old', startsMonth: '2025-01', targets: { essential: 5000 } }
const NEW: BudgetPlan = { id: 'new', startsMonth: '2026-12', targets }

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
    expect(planFor('2024-12', [NEW, OLD])).toBeNull()
    expect(planFor('2025-01', [NEW, OLD])?.id).toBe('old')
    expect(planFor('2026-11', [NEW, OLD])?.id).toBe('old')
    expect(planFor('2026-12', [NEW, OLD])?.id).toBe('new')
    expect(planFor('2030-01', [NEW, OLD])?.id).toBe('new')
  })

  it('ends a version the month before the next one starts', () => {
    expect(planEnd(OLD, [NEW, OLD])).toBe('2026-11')
    expect(planEnd(NEW, [NEW, OLD])).toBeNull()
  })
})

describe('traffic light', () => {
  it('colors a limit pot by how far it goes over, a minimum pot by how far it falls short', () => {
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
        pot: null,
        amountCents: 1000000,
        startMonth: '2026-11',
      }),
      makeEntry({ id: 'rent', pot: 'essential', amountCents: 400000, startMonth: '2026-11' }),
      makeEntry({
        id: 'voucher',
        kind: 'income',
        pot: null,
        accountId: 'va',
        amountCents: 100000,
        startMonth: '2026-11',
      }),
      makeEntry({
        id: 'groceries',
        pot: 'essential',
        accountId: 'va',
        amountCents: 100000,
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
    countFrom: null,
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
    expect(december.byPot.essential).toBe(500000)
  })

  it('judges each month by its own version, and leaves months before the first without a light', () => {
    const essential = { key: 'essential', goal: 'limit' } as const
    // 500k of 1.1M = 45%: within the old 50%, way over the new 33%.
    expect(potCell(essential, november)).toMatchObject({ targetBps: 5000, light: 'good' })
    expect(potCell(essential, december)).toMatchObject({
      targetBps: 3300,
      targetCents: 363000,
      light: 'bad',
    })
    expect(potCell(essential, before)).toMatchObject({ targetBps: null, light: null })
    // A pot the version leaves out has a 0% target.
    expect(potCell({ key: 'comfort', goal: 'limit' }, november).targetBps).toBe(0)
  })

  it('summarizes the lights of a month', () => {
    expect(lightSummary(pots, december)).toEqual({ good: 4, warn: 0, bad: 2 })
    expect(lightSummary(pots, before)).toEqual({ good: 0, warn: 0, bad: 0 })
  })

  it('shows archived pots only while they still have a target or spending', () => {
    const archived = pots.map((p) =>
      p.key === 'comfort' || p.key === 'essential' ? { ...p, archived: true } : p,
    )
    const shown = visiblePots(archived, [december]).map((p) => p.key)
    expect(shown).toContain('essential')
    // Still has a 7% target in the new version.
    expect(shown).toContain('comfort')
    expect(visiblePots(archived, [november]).map((p) => p.key)).not.toContain('comfort')
  })
})

describe('new pots', () => {
  it('takes the first unused color, cycling when all are taken', () => {
    expect(nextPotColor(pots)).toBe('sky')
    expect(nextPotColor([])).toBe('violet')
  })

  it('makes keys the database accepts', () => {
    expect(newPotKey(() => 0.5)).toMatch(/^p_[a-z0-9]{10}$/)
    expect(newPotKey()).toMatch(/^[a-z0-9_]{1,40}$/)
  })
})
