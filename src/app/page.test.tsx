import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LandingPage from './page'

const getServerUser = vi.fn<() => Promise<{ id: string } | null>>()
vi.mock('@/lib/auth/server', () => ({ getServerUser: () => getServerUser() }))
const redirect = vi.fn<(url: string) => never>()
// Outside a request in tests: the request-time marker is a no-op.
vi.mock('next/server', () => ({ connection: () => Promise.resolve() }))
vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }))
vi.mock('./_components/sign-in-button', () => ({
  SignInButton: () => <button type="button">Entrar com Google</button>,
}))

describe('landing page', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('explains Fluxi and offers the Google sign-in to a signed-out visitor', async () => {
    getServerUser.mockResolvedValue(null)
    render(await LandingPage())

    expect(screen.getByRole('heading', { level: 1, name: 'Fluxi' })).toBeInTheDocument()
    expect(screen.getByText(/transações recorrentes/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entrar com Google' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Privacidade' })).toHaveAttribute(
      'href',
      '/privacidade',
    )
    expect(screen.getByRole('link', { name: 'Termos' })).toHaveAttribute('href', '/termos')
  })

  it('sends a signed-in user to the painel', async () => {
    getServerUser.mockResolvedValue({ id: 'u1' })
    redirect.mockImplementation(() => {
      throw new Error('redirected')
    })
    await expect(LandingPage()).rejects.toThrow('redirected')
    expect(redirect).toHaveBeenCalledWith('/painel')
  })
})
