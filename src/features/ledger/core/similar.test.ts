import { describe, expect, it } from 'vitest'
import {
  descriptionKey,
  isPreselected,
  isSimilarAmount,
  ruleRange,
  type SimilarCandidate,
} from './similar'

describe('descriptionKey', () => {
  it.each([
    ['ATM VENEZA', 'atm veneza'],
    ['Atm  Veneza 0412', 'atm veneza'],
    ['  atm-veneza*123 ', 'atm veneza'],
    ['Padaria São João', 'padaria sao joao'],
    ['PADARIA SÃO JOÃO 22/11', 'padaria sao joao'],
    ['Pix 123456', 'pix'],
    ['1234', ''],
  ])('%s → %s', (raw, key) => {
    expect(descriptionKey(raw)).toBe(key)
  })
})

describe('isSimilarAmount', () => {
  it('keeps [0.5×, 2×] of the reference, sign ignored', () => {
    expect(isSimilarAmount(-1000, -500)).toBe(true)
    expect(isSimilarAmount(-1000, -2000)).toBe(true)
    expect(isSimilarAmount(-1000, 1500)).toBe(true)
    expect(isSimilarAmount(-1000, -499)).toBe(false)
    expect(isSimilarAmount(-1000, -2001)).toBe(false)
  })
})

describe('isPreselected', () => {
  const candidate = (over: Partial<SimilarCandidate> = {}): SimilarCandidate => ({
    id: 'c',
    description: 'ATM VENEZA',
    date: '2026-11-10',
    accountId: 'acc',
    amountCents: -1200,
    categoryId: null,
    budgetGroup: null,
    ...over,
  })

  it('preselects small unclassified ones only', () => {
    expect(isPreselected(-1000, candidate())).toBe(true)
    expect(isPreselected(-1000, candidate({ amountCents: -35000 }))).toBe(false)
    expect(isPreselected(-1000, candidate({ categoryId: 'x' }))).toBe(false)
    expect(isPreselected(-1000, candidate({ budgetGroup: 'essential' }))).toBe(false)
  })
})

describe('ruleRange', () => {
  it('spans the absolute amounts', () => {
    expect(ruleRange([-1000, -800, -1500])).toEqual({ minCents: 800, maxCents: 1500 })
  })
})
