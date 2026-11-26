import type { ActionResult } from '@/features/ledger/core/action-result'
import type { Space } from '@/features/spaces/core/space'
import { DropdownMenuItem, SidebarProvider } from '@cbrl/design'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SpaceAccountMenu } from './space-account-menu'

const actions = {
  switchSpaceAction: vi.fn<(input: unknown) => Promise<ActionResult>>(),
  createSpaceAction: vi.fn<(input: unknown) => Promise<ActionResult>>(),
  archiveSpaceAction: vi.fn<(input: unknown) => Promise<ActionResult>>(),
}
vi.mock('@/features/spaces/adapters/actions/spaces', () => ({
  switchSpaceAction: (i: unknown) => actions.switchSpaceAction(i),
  createSpaceAction: (i: unknown) => actions.createSpaceAction(i),
  archiveSpaceAction: (i: unknown) => actions.archiveSpaceAction(i),
}))
const toast = { success: vi.fn<(m: string) => void>(), error: vi.fn<(m: string) => void>() }
vi.mock('sonner', () => ({
  toast: { success: (m: string) => toast.success(m), error: (m: string) => toast.error(m) },
}))

const PERSONAL: Space = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Pessoal',
  kind: 'personal',
  archived: false,
}
const SHOP: Space = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Loja',
  kind: 'business',
  archived: false,
}
const OLD: Space = {
  ...SHOP,
  id: '00000000-0000-4000-8000-000000000003',
  name: 'Antiga',
  archived: true,
}

afterEach(() => vi.resetAllMocks())

async function openMenu(current: Space) {
  render(
    <SidebarProvider>
      <SpaceAccountMenu
        account={{ name: null, email: 'ana@example.test', avatarUrl: null }}
        spaces={{ current, all: [SHOP, PERSONAL, OLD] }}
      >
        <DropdownMenuItem>Sair</DropdownMenuItem>
      </SpaceAccountMenu>
    </SidebarProvider>,
  )
  await userEvent.click(
    screen.getByRole('button', {
      name: `Espaço: ${current.name}. Trocar de espaço e abrir a conta`,
    }),
  )
}

describe('SpaceAccountMenu', () => {
  it('falls back to the product name for an anonymous account', () => {
    render(
      <SidebarProvider>
        <SpaceAccountMenu
          account={{ name: null, email: null, avatarUrl: 'https://a/p.png' }}
          spaces={null}
        >
          <DropdownMenuItem>Sair</DropdownMenuItem>
        </SpaceAccountMenu>
      </SidebarProvider>,
    )
    expect(screen.getByRole('button', { name: 'Conta' })).toHaveTextContent('ContaFluxi')
  })

  it('makes the current space unmistakable on the trigger', async () => {
    await openMenu(SHOP)
    expect(
      screen.getByRole('button', { name: 'Espaço: Loja. Trocar de espaço e abrir a conta' }),
    ).toHaveTextContent('LojaEmpresaana@example.test')
  })

  it('lists the active spaces, personal first, and switches to another one', async () => {
    actions.switchSpaceAction.mockResolvedValue({ ok: true })
    await openMenu(PERSONAL)
    const items = screen.getAllByRole('menuitem').map((i) => i.textContent?.trim())
    expect(items).toEqual(['Pessoal', 'LojaEmpresa', 'Novo espaço…', 'Sair'])
    expect(screen.getByLabelText('atual')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('menuitem', { name: /Loja/ }))
    await waitFor(() => expect(actions.switchSpaceAction).toHaveBeenCalledWith(SHOP.id))
  })

  it('does not switch to the current space', async () => {
    await openMenu(PERSONAL)
    await userEvent.click(screen.getByRole('menuitem', { name: /Pessoal/ }))
    expect(actions.switchSpaceAction).not.toHaveBeenCalled()
  })

  it('creates a business space from "Novo espaço…"', async () => {
    actions.createSpaceAction.mockResolvedValue({ ok: true })
    await openMenu(PERSONAL)
    await userEvent.click(screen.getByRole('menuitem', { name: 'Novo espaço…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Novo espaço' })
    expect(dialog).toHaveTextContent('Empresa')
    await userEvent.type(screen.getByLabelText('Nome'), 'Minha empresa')
    await userEvent.click(screen.getByRole('button', { name: 'Criar espaço' }))
    await waitFor(() =>
      expect(actions.createSpaceAction).toHaveBeenCalledWith({
        name: 'Minha empresa',
        kind: 'business',
      }),
    )
    expect(toast.success).toHaveBeenCalledWith('Espaço criado.')
  })

  it('archives the current business space after confirming, never the personal one', async () => {
    actions.archiveSpaceAction.mockResolvedValue({ ok: false, error: 'Espaço não encontrado.' })
    await openMenu(SHOP)
    await userEvent.click(screen.getByRole('menuitem', { name: /Arquivar/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Arquivar' }))
    await waitFor(() => expect(actions.archiveSpaceAction).toHaveBeenCalledWith(SHOP.id))
    expect(toast.error).toHaveBeenCalledWith('Espaço não encontrado.')
  })

  it('shows the account (avatar, name, e-mail) without spaces when they are unknown', async () => {
    render(
      <SidebarProvider>
        <SpaceAccountMenu
          account={{ name: 'Ana Souza', email: 'ana@example.test', avatarUrl: 'https://a/p.png' }}
          spaces={null}
        >
          <DropdownMenuItem>Sair</DropdownMenuItem>
        </SpaceAccountMenu>
      </SidebarProvider>,
    )
    const trigger = screen.getByRole('button', { name: 'Conta' })
    expect(trigger).toHaveTextContent('ContaAna Souza')
    await userEvent.click(trigger)
    const menu = await screen.findByRole('menu')
    expect(menu).toHaveTextContent('Ana Souzaana@example.test')
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Sair'])
  })

  it('offers no archive for the personal space', async () => {
    await openMenu(PERSONAL)
    expect(screen.queryByRole('menuitem', { name: /Arquivar/ })).not.toBeInTheDocument()
  })
})
