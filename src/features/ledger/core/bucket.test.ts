import { describe, expect, it } from 'vitest'
import { accountIdsInBucket, bucketOfAccount, bucketOfType, landingTouchesBucket } from './bucket'
import { makeEntry } from './fixtures'
import { landingsIn, type Landing } from './occurrence'

const accounts = [
  { id: 'cc', type: 'checking' },
  { id: 'card', type: 'credit' },
  { id: 'va', type: 'benefit' },
  { id: 'vr', type: 'benefit' },
  { id: 'cdb', type: 'investment' },
  { id: 'car', type: 'loan' },
] as const

function landingOf(accountId: string, toAccountId: string | null = null): Landing {
  const entry = makeEntry({
    kind: toAccountId === null ? 'expense' : 'transfer',
    accountId,
    toAccountId,
  })
  const [landing] = landingsIn(entry, [], [], '2026-12')
  if (landing === undefined) throw new Error('no landing')
  return landing
}

describe('money buckets', () => {
  it('puts only benefit accounts in the benefit bucket', () => {
    expect(bucketOfType('benefit')).toBe('benefit')
    for (const type of ['checking', 'credit', 'investment', 'loan'] as const) {
      expect(bucketOfType(type)).toBe('available')
    }
    expect(accountIdsInBucket(accounts, 'available')).toEqual(['cc', 'card', 'cdb', 'car'])
    expect(accountIdsInBucket(accounts, 'benefit')).toEqual(['va', 'vr'])
  })

  it('treats unknown accounts as available', () => {
    expect(bucketOfAccount('va', accounts)).toBe('benefit')
    expect(bucketOfAccount('ghost', accounts)).toBe('available')
  })

  it('says which buckets a landing touches (both sides of a transfer)', () => {
    expect(landingTouchesBucket(landingOf('va'), 'benefit', accounts)).toBe(true)
    expect(landingTouchesBucket(landingOf('va'), 'available', accounts)).toBe(false)
    expect(landingTouchesBucket(landingOf('va', 'vr'), 'available', accounts)).toBe(false)
    const crossing = landingOf('cc', 'va')
    expect(landingTouchesBucket(crossing, 'available', accounts)).toBe(true)
    expect(landingTouchesBucket(crossing, 'benefit', accounts)).toBe(true)
  })
})
