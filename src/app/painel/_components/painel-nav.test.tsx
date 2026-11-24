import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PainelNav } from './painel-nav'
import { Unavailable } from './unavailable'

let pathname = '/painel'
const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ refresh }),
}))

describe('PainelNav', () => {
  it('marks the timeline only on /painel', () => {
    render(<PainelNav />)
    expect(screen.getByRole('link', { name: 'Linha do tempo' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Calendário' })).not.toHaveAttribute('aria-current')
    expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual([
      'Linha do tempo',
      'A pagar',
      'Lançamentos',
      'Bancos e contas',
      'Orçamento',
      'Calendário',
    ])
  })

  it('marks nested sections', () => {
    pathname = '/painel/lancamentos'
    render(<PainelNav />)
    expect(screen.getByRole('link', { name: 'Lançamentos' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'Linha do tempo' })).not.toHaveAttribute('aria-current')
  })
})

describe('Unavailable', () => {
  it('retries by refreshing the route', async () => {
    render(<Unavailable />)
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(refresh).toHaveBeenCalledOnce()
  })
})
