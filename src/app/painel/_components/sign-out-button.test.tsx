import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SignOutButton } from './sign-out-button'
import { Topbar } from './topbar'

const signOut = vi.fn<() => Promise<void>>(() => Promise.resolve())
vi.mock('@/hooks/use-sign-out', () => ({
  useSignOut: () => signOut,
}))

describe('SignOutButton', () => {
  it('signs out', async () => {
    render(<SignOutButton />)

    await userEvent.click(screen.getByRole('button', { name: 'Sair' }))
    expect(signOut).toHaveBeenCalledOnce()
  })
})

describe('Topbar', () => {
  it('shows the brand and the sign-out button', () => {
    render(<Topbar />)
    expect(screen.getByRole('banner')).toHaveTextContent('Fluxi')
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument()
  })
})
