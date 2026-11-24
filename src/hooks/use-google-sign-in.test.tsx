import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useGoogleSignIn } from './use-google-sign-in'

type Options = { next: string; onError?: (error: Error) => void }

let pathname = '/'
let searchParams = new URLSearchParams()
let configured = true

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useSearchParams: () => searchParams,
}))

vi.mock('@cbrl/supabase', () => ({
  isSupabaseConfigured: () => configured,
}))

const startSignIn = vi.fn<() => Promise<void>>()
const hookOptions = vi.fn<(options: Options) => void>()
vi.mock('@cbrl/supabase/react', () => ({
  useGoogleSignIn: (options: Options) => {
    hookOptions(options)
    return { signIn: startSignIn, pending: false }
  },
}))

const toastError = vi.fn<(message: string) => void>()
vi.mock('sonner', () => ({
  toast: {
    error: (message: string) => {
      toastError(message)
    },
  },
}))

function nextParam(): string | undefined {
  renderHook(() => useGoogleSignIn())
  return hookOptions.mock.lastCall?.[0].next
}

describe('useGoogleSignIn', () => {
  afterEach(() => {
    vi.resetAllMocks()
    pathname = '/'
    searchParams = new URLSearchParams()
    configured = true
  })

  it('does not start OAuth when Supabase is not configured', async () => {
    configured = false

    const { result } = renderHook(() => useGoogleSignIn())
    await act(() => result.current.signIn())

    expect(startSignIn).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith(expect.stringContaining('Login indisponível'))
  })

  it('starts the Google redirect when configured', async () => {
    const { result } = renderHook(() => useGoogleSignIn())
    await act(() => result.current.signIn())

    expect(startSignIn).toHaveBeenCalledOnce()
  })

  it('returns to the safe next param', () => {
    searchParams = new URLSearchParams({ next: '/painel?mes=2026-11' })

    expect(nextParam()).toBe('/painel?mes=2026-11')
  })

  it('falls back to the current path without the auth params', () => {
    searchParams = new URLSearchParams({ login: '1', login_error: '1', mes: '2026-11', page: '2' })

    expect(nextParam()).toBe('/?mes=2026-11&page=2')
  })

  it('uses the bare pathname when only auth params are present', () => {
    pathname = '/painel'
    searchParams = new URLSearchParams({ login: '1' })

    expect(nextParam()).toBe('/painel')
  })

  it('rejects unsafe next params (protocol-relative) and falls back to the current path', () => {
    searchParams = new URLSearchParams({ next: '//evil.example.com', mes: '2026-11' })

    expect(nextParam()).toBe('/?mes=2026-11')
  })

  it('toasts when the sign-in cannot start', () => {
    renderHook(() => useGoogleSignIn())
    act(() => hookOptions.mock.lastCall?.[0].onError?.(new Error('provider disabled')))

    expect(toastError).toHaveBeenCalledWith('Não foi possível entrar com o Google. Tenta de novo.')
  })
})
