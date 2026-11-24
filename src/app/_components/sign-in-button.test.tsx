import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SignInButton } from './sign-in-button'

let loading = false
const signIn = vi.fn<() => Promise<void>>(() => Promise.resolve())
vi.mock('@/hooks/use-google-sign-in', () => ({
  useGoogleSignIn: () => ({ signIn, loading }),
}))

describe('SignInButton', () => {
  afterEach(() => {
    vi.clearAllMocks()
    loading = false
  })

  it('starts the Google sign-in', async () => {
    render(<SignInButton />)

    await userEvent.click(screen.getByRole('button', { name: 'Entrar com Google' }))
    expect(signIn).toHaveBeenCalledOnce()
  })

  it('is disabled while the redirect starts', () => {
    loading = true
    render(<SignInButton />)

    expect(screen.getByRole('button', { name: 'Conectando…' })).toBeDisabled()
  })
})
