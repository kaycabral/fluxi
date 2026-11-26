import { LedgerShell } from '@/features/ledger/ui/ledger-shell'
import { sampleRefs } from '@/features/ledger/ui/test-fixtures'
import type { Space } from '@/features/spaces/core/space'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppSidebar } from './app-sidebar'

const signOut = vi.fn()
let pathname = '/painel'
vi.mock('@/features/ledger/adapters/actions/undo', () => ({
  undoAction: vi.fn(),
  forgetUndoAction: vi.fn(),
}))
vi.mock('@/hooks/use-sign-out', () => ({ useSignOut: () => signOut }))
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
}))
vi.mock('@/features/ledger/adapters/actions/entries', () => ({
  createEntryAction: vi.fn(),
  updateEntryAction: vi.fn(),
  deleteEntryAction: vi.fn(),
  changeDayAction: vi.fn(),
}))

vi.mock('@/features/spaces/adapters/actions/spaces', () => ({
  switchSpaceAction: vi.fn(),
  createSpaceAction: vi.fn(),
  archiveSpaceAction: vi.fn(),
}))

const PERSONAL = { id: 's1', name: 'Pessoal', kind: 'personal', archived: false } as const
const WORK = { id: 's2', name: 'Loja', kind: 'business', archived: false } as const

function renderSidebar(legacyScreens = true, defaultOpen = true, current: Space | null = PERSONAL) {
  return render(
    <LedgerShell refs={sampleRefs()}>
      <AppSidebar
        legacyScreens={legacyScreens}
        defaultOpen={defaultOpen}
        spaces={current === null ? null : { current, all: [PERSONAL, WORK] }}
      >
        <p>conteúdo</p>
      </AppSidebar>
    </LedgerShell>,
  )
}

describe('AppSidebar', () => {
  it('lists the dashboard, calendar, entries and budget, marking the current page', () => {
    renderSidebar()
    const nav = screen.getByRole('navigation', { name: 'Seções' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual([
      'Painel',
      'Calendário',
      'Lançamentos',
      'Orçamento',
    ])
    expect(links[0]).toHaveAttribute('href', '/painel')
    expect(links[1]).toHaveAttribute('href', '/painel/calendario')
    expect(links[0]).toHaveAttribute('data-active', 'true')
    expect(screen.getByText('conteúdo')).toBeInTheDocument()
  })

  it('leads back to the old screens and signs out', async () => {
    renderSidebar()
    expect(screen.getByRole('link', { name: 'Telas antigas' })).toHaveAttribute(
      'href',
      '/painel/linha-do-tempo',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Sair' }))
    expect(signOut).toHaveBeenCalledOnce()
  })

  it('shows the current space in the header and the switcher on top of the sidebar', () => {
    renderSidebar(true, true, WORK)
    const badge = screen.getByLabelText('Espaço atual: Loja')
    expect(within(badge).getByText('Empresa')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Espaço: Loja. Trocar de espaço' }),
    ).toBeInTheDocument()
  })

  it('leaves the space out when the spaces could not be read', () => {
    renderSidebar(true, true, null)
    expect(screen.queryByLabelText(/Espaço atual/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Trocar de espaço/ })).not.toBeInTheDocument()
  })

  it('links to the bank connections', () => {
    renderSidebar()
    expect(screen.getByRole('link', { name: 'Conexões bancárias' })).toHaveAttribute(
      'href',
      '/painel/conexoes',
    )
  })

  it('hides the old screens when they are off (production)', () => {
    renderSidebar(false)
    expect(screen.queryByRole('link', { name: 'Telas antigas' })).not.toBeInTheDocument()
  })

  it('creates an entry from the header', async () => {
    renderSidebar()
    await userEvent.click(screen.getByRole('button', { name: 'Criar' }))
    expect(await screen.findByRole('dialog', { name: 'Novo lançamento' })).toBeInTheDocument()
  })

  it('remembers each toggle of the sidebar in this browser', async () => {
    window.history.replaceState(null, '', '/painel')
    const { unmount } = renderSidebar(true, false)
    // Started collapsed (as the cookie said), so the toggle expands it.
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Toggle Sidebar' })[0] ?? document.body,
    )
    expect(document.cookie).toContain('fluxi_sidebar=open')
    unmount()
    renderSidebar()
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Toggle Sidebar' })[0] ?? document.body,
    )
    expect(document.cookie).toContain('fluxi_sidebar=collapsed')
  })

  it('leaves "Criar" to pages that put it beside their title', () => {
    pathname = '/painel/lancamentos'
    renderSidebar()
    expect(screen.queryByRole('button', { name: 'Criar' })).not.toBeInTheDocument()
    pathname = '/painel'
  })
})
