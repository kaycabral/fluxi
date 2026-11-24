import { POT_KEYS, type BudgetPot, type PotKey } from './types'

/** Pot targets (bps of income) and the monthly traffic light. 10000 bps = 100%. */

export type Targets = Record<PotKey, number>

export function targetsOf(pots: readonly BudgetPot[]): Targets {
  const targets: Targets = {
    essential: 0,
    comfort: 0,
    guilt_free: 0,
    education: 0,
    variable: 0,
    investment: 0,
  }
  for (const pot of pots) targets[pot.key] = pot.targetBps
  return targets
}

export function totalBps(targets: Targets): number {
  return POT_KEYS.reduce((sum, key) => sum + targets[key], 0)
}

/** What is still undistributed (never negative). */
export function freeBps(targets: Targets): number {
  return Math.max(0, 10000 - totalBps(targets))
}

/** Highest value `key` may take given the others (the sum never passes 100%). */
export function maxBpsFor(targets: Targets, key: PotKey): number {
  return Math.max(0, 10000 - (totalBps(targets) - targets[key]))
}

/** Set `key` to `bps`, clamped to [0, what the other pots leave]. */
export function clampTarget(targets: Targets, key: PotKey, bps: number): Targets {
  const value = Math.round(Math.min(Math.max(0, bps), maxBpsFor(targets, key)))
  return { ...targets, [key]: value }
}

export type Light = 'good' | 'warn' | 'bad'

/**
 * Planned share of income vs the target: green within the target, yellow up
 * to 20% off, red beyond. Investment is inverted (more is better).
 */
export function trafficLight(key: PotKey, actualRatio: number, targetRatio: number): Light {
  if (key === 'investment') {
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
