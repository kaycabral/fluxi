import { afterEach, describe, expect, it, vi } from 'vitest'
import { requirePainelUser, todayIso } from './session'

// `server-only` throws outside a React Server Component bundle.
vi.mock('server-only', () => ({}))

const getServerUser = vi.fn<() => Promise<{ id: string } | null>>()
vi.mock('@/lib/auth/server', () => ({ getServerUser: () => getServerUser() }))
const redirect = vi.fn<(url: string) => never>()
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }))

afterEach(() => vi.resetAllMocks())

describe('painel session', () => {
  it('returns the signed-in user', async () => {
    getServerUser.mockResolvedValue({ id: 'u1' })
    await expect(requirePainelUser()).resolves.toEqual({ id: 'u1' })
  })

  it('redirects without a session', async () => {
    getServerUser.mockResolvedValue(null)
    redirect.mockImplementation(() => {
      throw new Error('redirected')
    })
    await expect(requirePainelUser()).rejects.toThrow('redirected')
    expect(redirect).toHaveBeenCalledWith('/?login=1&next=%2Fpainel')
  })

  it('formats today as an ISO day', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
