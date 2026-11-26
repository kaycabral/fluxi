import { describe, expect, it } from 'vitest'
import {
  descriptionKey,
  isPreselected,
  isSimilarAmount,
  matchesKey,
  ruleKey,
  ruleKeyLabel,
  ruleRange,
  similarityKey,
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
    merchantName: null,
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

describe('similarityKey / matchesKey', () => {
  const generic = 'Compra no débito autorizada'

  it('uses the merchant when the bank gave one, else the description', () => {
    expect(similarityKey({ description: generic, merchantName: 'Padaria Pão 22' })).toEqual({
      by: 'merchant',
      key: 'padaria pao',
    })
    expect(similarityKey({ description: 'ATM VENEZA 01', merchantName: ' ' })).toEqual({
      by: 'description',
      key: 'atm veneza',
    })
  })

  it('matches by the chosen key only', () => {
    const byMerchant = similarityKey({ description: generic, merchantName: 'Padaria Pão' })
    expect(matchesKey(byMerchant, { description: 'Outra', merchantName: 'PADARIA PAO' })).toBe(true)
    // Same generic text, other or no merchant: not the same place.
    expect(matchesKey(byMerchant, { description: generic, merchantName: 'Uber' })).toBe(false)
    expect(matchesKey(byMerchant, { description: generic, merchantName: null })).toBe(false)

    const byDescription = similarityKey({ description: 'ATM VENEZA 01', merchantName: null })
    expect(matchesKey(byDescription, { description: 'Atm Veneza', merchantName: 'X' })).toBe(true)
    expect(
      matchesKey({ by: 'description', key: '' }, { description: '', merchantName: null }),
    ).toBe(false)
  })

  it('labels rules by their key', () => {
    expect(ruleKeyLabel({ pattern: 'atm veneza', merchantKey: null })).toBe('“atm veneza”')
    expect(ruleKey({ pattern: null, merchantKey: null })).toBe('')
    expect(ruleKeyLabel({ pattern: null, merchantKey: 'padaria pao' })).toBe(
      'Estabelecimento “padaria pao”',
    )
  })
})
