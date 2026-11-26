import { describe, expect, it } from 'vitest'
import { compatibleTypes, createdTypeFor, ledgerBalanceOf, mapFeedAccountSchema } from './mapping'

describe('feed account mapping', () => {
  it('maps cards to credit accounts and bank accounts to the others', () => {
    expect(compatibleTypes('CREDIT')).toEqual(['credit'])
    expect(compatibleTypes('BANK')).toContain('checking')
    expect(compatibleTypes('BANK')).not.toContain('credit')
    expect(createdTypeFor('CREDIT')).toBe('credit')
    expect(createdTypeFor('BANK')).toBe('checking')
  })

  it('holds a card bill as debt', () => {
    expect(ledgerBalanceOf('CREDIT', 30000)).toBe(-30000)
    expect(ledgerBalanceOf('BANK', 30000)).toBe(30000)
  })

  it('validates the target', () => {
    const id = '00000000-0000-4000-8000-000000000001'
    expect(
      mapFeedAccountSchema.safeParse({ feedAccountId: id, target: { kind: 'create' } }).success,
    ).toBe(true)
    expect(
      mapFeedAccountSchema.safeParse({
        feedAccountId: id,
        target: { kind: 'account', accountId: 'x' },
      }).success,
    ).toBe(false)
    expect(
      mapFeedAccountSchema.safeParse({ feedAccountId: 'x', target: { kind: 'none' } }).success,
    ).toBe(false)
  })
})
