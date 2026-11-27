import { describe, expect, it } from 'vitest'
import { goalInputSchema } from './schemas'

const base = {
  id: null,
  name: ' Carro ',
  kind: 'purchase',
  budgetGroup: 'goals',
  targetCents: 9_500_000,
  targetMonth: '2029-01',
  monthlyCents: 150_000,
  initialCents: 0,
  withdrawalBps: 400,
  accountId: null,
}

describe('goalInputSchema', () => {
  it('trims the name and requires value and month for dated goals', () => {
    expect(goalInputSchema.parse(base).name).toBe('Carro')
    expect(goalInputSchema.safeParse({ ...base, targetMonth: null }).success).toBe(false)
  })

  it('refuses a month on undated goals and drops the slice of independence', () => {
    expect(goalInputSchema.safeParse({ ...base, kind: 'emergency' }).success).toBe(false)
    const fi = goalInputSchema.parse({ ...base, kind: 'independence', targetMonth: null })
    expect(fi.monthlyCents).toBeNull()
  })
})
