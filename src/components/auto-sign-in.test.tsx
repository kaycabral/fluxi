import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AutoSignIn } from './auto-sign-in'

let searchParams = new URLSearchParams()
const replace = vi.fn<(href: string) => void>()
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ replace }),
  useSearchParams: () => searchParams,
}))

const signIn = vi.fn<() => Promise<void>>(() => Promise.resolve())
vi.mock('@/hooks/use-google-sign-in', () => ({
  useGoogleSignIn: () => ({ signIn, loading: false }),
}))

const toastError = vi.fn<(message: string) => void>()
vi.mock('sonner', () => ({
  toast: {
    error: (message: string) => {
      toastError(message)
    },
  },
}))

describe('AutoSignIn', () => {
  afterEach(() => {
    vi.clearAllMocks()
    searchParams = new URLSearchParams()
  })

  it('does nothing without auth flags', () => {
    render(<AutoSignIn />)

    expect(signIn).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('starts the Google sign-in on ?login=1 and strips the flag', async () => {
    searchParams = new URLSearchParams({ login: '1', next: '/painel' })

    render(<AutoSignIn />)

    await waitFor(() => expect(signIn).toHaveBeenCalledOnce())
    expect(replace).toHaveBeenCalledWith('/?next=%2Fpainel')
  })

  it('turns ?login_error=1 into a toast instead of signing in', async () => {
    searchParams = new URLSearchParams({ login_error: '1' })

    render(<AutoSignIn />)

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith('Não foi possível concluir o login. Tenta de novo.'),
    )
    expect(signIn).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith('/')
  })
})
