import { FUTURE_PAID_DATE } from '@/features/ledger/core/pay-dates'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { markPaidAction } from './payments'

type Result = { ok: true } | { ok: false; reason: string }
const markOccurrencePaid = vi.fn<(...args: unknown[]) => Promise<Result>>()
const SCOPE = { userId: 'session-user', spaceId: 'space-1' }

vi.mock('@/features/spaces/adapters/scope', () => ({
  getServerScope: () => Promise.resolve(SCOPE),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/features/ledger/adapters/payments.write', () => ({
  markOccurrencePaid: (...a: unknown[]) => markOccurrencePaid(...a),
  unmarkOccurrencePaid: vi.fn(),
}))

const KEY = { entryId: '11111111-1111-4111-8111-111111111111', month: '2026-11', partId: null }

beforeEach(() => {
  // 2026-11-26 12:00 in São Paulo.
  vi.useFakeTimers({ now: new Date('2026-11-26T15:00:00Z'), toFake: ['Date'] })
  markOccurrencePaid.mockResolvedValue({ ok: true })
})
afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('markPaidAction', () => {
  it('defaults the paid date to today', async () => {
    expect(await markPaidAction(KEY)).toEqual({ ok: true })
    expect(markOccurrencePaid).toHaveBeenCalledWith(SCOPE, { ...KEY, paidOn: '2026-11-26' })
  })

  it('accepts today and past dates', async () => {
    expect(await markPaidAction({ ...KEY, paidOn: '2026-11-26' })).toEqual({ ok: true })
    expect(await markPaidAction({ ...KEY, paidOn: '2026-11-24' })).toEqual({ ok: true })
    expect(markOccurrencePaid).toHaveBeenLastCalledWith(SCOPE, { ...KEY, paidOn: '2026-11-24' })
  })

  it('refuses a paid date in the future without writing', async () => {
    expect(await markPaidAction({ ...KEY, paidOn: '2026-11-27' })).toEqual({
      ok: false,
      error: FUTURE_PAID_DATE,
    })
    expect(markOccurrencePaid).not.toHaveBeenCalled()
  })
})
