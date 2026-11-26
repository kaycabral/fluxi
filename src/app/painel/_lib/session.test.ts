import { afterEach, describe, expect, it, vi } from 'vitest'
import { requirePainelScope, todayIso } from './session'

// `server-only` throws outside a React Server Component bundle.
vi.mock('server-only', () => ({}))

const getServerScope = vi.fn<() => Promise<{ userId: string; spaceId: string } | null>>()
vi.mock('@/features/spaces/adapters/scope', () => ({ getServerScope: () => getServerScope() }))
const redirect = vi.fn<(url: string) => never>()
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }))

afterEach(() => vi.resetAllMocks())

describe('painel session', () => {
  it('returns the signed-in scope', async () => {
    getServerScope.mockResolvedValue({ userId: 'u1', spaceId: 's1' })
    await expect(requirePainelScope()).resolves.toEqual({ userId: 'u1', spaceId: 's1' })
  })

  it('redirects without a session', async () => {
    getServerScope.mockResolvedValue(null)
    redirect.mockImplementation(() => {
      throw new Error('redirected')
    })
    await expect(requirePainelScope()).rejects.toThrow('redirected')
    expect(redirect).toHaveBeenCalledWith('/?login=1&next=%2Fpainel')
  })

  it('formats today as an ISO day', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
