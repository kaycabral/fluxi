import { LedgerShell } from '@/features/ledger/ui/ledger-shell'
import { sampleRefs } from '@/features/ledger/ui/test-fixtures'
import type { Space } from '@/features/spaces/core/space'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AppSidebar } from './app-sidebar'

const signOut = vi.fn()
let pathname = '/painel'
vi.mock('@/features/ledger/adapters/actions/categorize', () => ({
  findSimilarAction: vi.fn(() =>
    Promise.resolve({ ok: true, data: { reference: null, candidates: [] } }),
  ),
  categorizeEntriesAction: vi.fn(() => Promise.resolve({ ok: true })),
  loadRulesAction: vi.fn(() => Promise.resolve({ ok: true, data: [] })),
  deleteRuleAction: vi.fn(() => Promise.resolve({ ok: true })),
}))
vi.mock('@/features/ledger/adapters/actions/undo', () => ({
  undoAction: vi.fn(),
  forgetUndoAction: vi.fn(),
}))
vi.mock('@/features/ledger/adapters/actions/accounts', () => ({
  loadAccountsAction: vi.fn(),
  renameAccountAction: vi.fn(),
  setAccountArchivedAction: vi.fn(),
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
  assignFeedItemAction: vi.fn(),
  loadConnectionsAction: () => Promise.resolve({ ok: true, data: { connections: [], spaces: [] } }),
}))

const PERSONAL = { id: 's1', name: 'Pessoal', kind: 'personal', archived: false } as const
const WORK = { id: 's2', name: 'Loja', kind: 'business', archived: false } as const

function renderSidebar(legacyScreens = true, defaultOpen = true, current: Space | null = PERSONAL) {
  return render(
    <LedgerShell refs={sampleRefs()}>
      <AppSidebar
        legacyScreens={legacyScreens}
        defaultOpen={defaultOpen}
        account={{ name: 'Ana Souza', email: 'ana@example.test', avatarUrl: null }}
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
      'Transações',
      'Orçamento',
    ])
    expect(links[0]).toHaveAttribute('href', '/painel')
    expect(links[1]).toHaveAttribute('href', '/painel/calendario')
    expect(links[0]).toHaveAttribute('data-active', 'true')
    expect(screen.getByText('conteúdo')).toBeInTheDocument()
    // Following a link closes the mobile sheet (a no-op on desktop).
    fireEvent.click(within(nav).getByRole('link', { name: 'Calendário' }))
  })

  it('opens one menu with the account, the spaces and the account actions', async () => {
    renderSidebar()
    await userEvent.click(
      screen.getByRole('button', { name: 'Espaço: Pessoal. Trocar de espaço e abrir a conta' }),
    )
    const menu = await screen.findByRole('menu')
    expect(menu).toHaveTextContent('Ana Souza')
    expect(menu).toHaveTextContent('ana@example.test')
    expect(within(menu).getByText('AS')).toBeInTheDocument()
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent?.trim()),
    ).toEqual(['Pessoal', 'LojaEmpresa', 'Novo espaço…', 'Configurações', 'Telas antigas', 'Sair'])
    expect(within(menu).getByRole('menuitem', { name: 'Configurações' })).toHaveAttribute(
      'href',
      '#configuracoes/conexoes',
    )
    expect(within(menu).getByRole('menuitem', { name: 'Telas antigas' })).toHaveAttribute(
      'href',
      '/painel/linha-do-tempo',
    )
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Configurações' }))
    expect(await screen.findByRole('dialog', { name: 'Conexões' })).toHaveTextContent(
      'Nenhuma conexão ainda.',
    )
    window.history.replaceState(null, '', '/painel')
    await userEvent.keyboard('{Escape}')
    await userEvent.click(
      screen.getByRole('button', { name: 'Espaço: Pessoal. Trocar de espaço e abrir a conta' }),
    )
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sair' }))
    expect(signOut).toHaveBeenCalledOnce()
  })

  it('puts the brand on top and the space menu at the bottom, never in the header', () => {
    renderSidebar(true, true, WORK)
    expect(screen.getByRole('link', { name: /Fluxi/ })).toHaveAttribute('href', '/painel')
    const trigger = screen.getByRole('button', {
      name: 'Espaço: Loja. Trocar de espaço e abrir a conta',
    })
    expect(trigger).toHaveTextContent('LojaEmpresaAna Souza')
    expect(screen.getByRole('banner')).not.toHaveTextContent('Loja')
  })

  it('keeps the account menu when the spaces could not be read', async () => {
    renderSidebar(true, true, null)
    await userEvent.click(screen.getByRole('button', { name: 'Conta' }))
    const menu = await screen.findByRole('menu')
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((i) => i.textContent?.trim()),
    ).toEqual(['Configurações', 'Telas antigas', 'Sair'])
  })

  it('hides the old screens when they are off (production)', async () => {
    renderSidebar(false)
    await userEvent.click(screen.getByRole('button', { name: /Trocar de espaço/ }))
    await screen.findByRole('menu')
    expect(screen.queryByRole('menuitem', { name: 'Telas antigas' })).not.toBeInTheDocument()
  })

  it('creates an entry from the header', async () => {
    renderSidebar()
    await userEvent.click(screen.getByRole('button', { name: 'Criar' }))
    expect(await screen.findByRole('dialog', { name: 'Nova transação' })).toBeInTheDocument()
  })

  it('has no collapse button in the header besides the mobile-only trigger', () => {
    renderSidebar()
    const header = screen.getByRole('banner')
    const toggle = within(header).getByRole('button', { name: 'Abrir menu' })
    expect(toggle).toHaveClass('md:hidden')
    expect(within(header).getAllByRole('button')).toHaveLength(2)
  })

  it('remembers each toggle of the sidebar (rail) in this browser', async () => {
    window.history.replaceState(null, '', '/painel')
    const { unmount } = renderSidebar(true, false)
    // Started collapsed (as the cookie said), so the rail expands it.
    await userEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }))
    expect(document.cookie).toContain('fluxi_sidebar=open')
    unmount()
    renderSidebar()
    await userEvent.click(screen.getByRole('button', { name: 'Toggle Sidebar' }))
    expect(document.cookie).toContain('fluxi_sidebar=collapsed')
  })

  it('leaves "Criar" to pages that put it beside their title', () => {
    pathname = '/painel/transacoes'
    renderSidebar()
    expect(screen.queryByRole('button', { name: 'Criar' })).not.toBeInTheDocument()
    pathname = '/painel'
  })
})
