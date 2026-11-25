import { describe, expect, it } from 'vitest'
import { accountIdsInBucket, bucketOfType } from './bucket'

const accounts = [
  { id: 'cc', type: 'checking' },
  { id: 'card', type: 'credit' },
  { id: 'va', type: 'benefit' },
  { id: 'vr', type: 'benefit' },
  { id: 'cdb', type: 'investment' },
  { id: 'car', type: 'loan' },
] as const

describe('money buckets', () => {
  it('puts only benefit accounts in the benefit bucket', () => {
    expect(bucketOfType('benefit')).toBe('benefit')
    for (const type of ['checking', 'credit', 'investment', 'loan'] as const) {
      expect(bucketOfType(type)).toBe('available')
    }
    expect(accountIdsInBucket(accounts, 'available')).toEqual(['cc', 'card', 'cdb', 'car'])
    expect(accountIdsInBucket(accounts, 'benefit')).toEqual(['va', 'vr'])
  })
})
