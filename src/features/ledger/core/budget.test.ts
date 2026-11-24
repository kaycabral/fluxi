import { describe, expect, it } from 'vitest'
import {
  clampTarget,
  freeBps,
  maxBpsFor,
  ratioOf,
  targetsOf,
  totalBps,
  trafficLight,
} from './budget'
import { DEFAULT_POTS } from './defaults'

describe('budget', () => {
  const targets = targetsOf(DEFAULT_POTS)

  it('reads targets from pots', () => {
    expect(targets.essential).toBe(3300)
    expect(totalBps(targets)).toBe(9000)
    expect(freeBps(targets)).toBe(1000)
    expect(targetsOf([]).investment).toBe(0)
  })

  it('never lets the sum pass 100%', () => {
    expect(maxBpsFor(targets, 'comfort')).toBe(1700)
    expect(clampTarget(targets, 'comfort', 5000).comfort).toBe(1700)
    const lowered = clampTarget(targets, 'essential', 3000)
    expect(freeBps(lowered)).toBe(1300)
    expect(clampTarget(lowered, 'comfort', 5000).comfort).toBe(2000)
    expect(clampTarget(lowered, 'comfort', -5).comfort).toBe(0)
  })

  it('colors the traffic light, inverted for investment', () => {
    expect(trafficLight('essential', 0.3, 0.33)).toBe('good')
    expect(trafficLight('essential', 0.38, 0.33)).toBe('warn')
    expect(trafficLight('essential', 0.5, 0.33)).toBe('bad')
    expect(trafficLight('investment', 0.35, 0.32)).toBe('good')
    expect(trafficLight('investment', 0.27, 0.32)).toBe('warn')
    expect(trafficLight('investment', 0.1, 0.32)).toBe('bad')
  })

  it('computes ratios safely', () => {
    expect(ratioOf(50, 200)).toBe(0.25)
    expect(ratioOf(50, 0)).toBe(0)
  })
})
