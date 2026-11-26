import type { ActionResult } from '@/features/ledger/core/action-result'
import type { Space } from '@/features/spaces/core/space'
import { DropdownMenuItem, SidebarProvider } from '@cbrl/design'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SpaceAccountMenu } from './space-account-menu'

const actions = {
  switchSpaceAction: vi.fn<(input: unknown) => Promise<ActionResult>>(),
  createSpaceAction: vi.fn<(input: unknown) => Promise<ActionResult>>(),
  archiveSpaceAction: vi.fn<(input: unknown) => Promise<ActionResult>>(),
  updateSpaceAction: vi.fn<(input: unknown) => Promise<ActionResult>>(),
}
vi.mock('@/features/spaces/adapters/actions/spaces', () => ({
  switchSpaceAction: (i: unknown) => actions.switchSpaceAction(i),
  createSpaceAction: (i: unknown) => actions.createSpaceAction(i),
  archiveSpaceAction: (i: unknown) => actions.archiveSpaceAction(i),
  updateSpaceAction: (i: unknown) => actions.updateSpaceAction(i),
}))
const toast = { success: vi.fn<(m: string) => void>(), error: vi.fn<(m: string) => void>() }
vi.mock('sonner', () => ({
  toast: { success: (m: string) => toast.success(m), error: (m: string) => toast.error(m) },
}))

const PERSONAL: Space = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Pessoal',
  kind: 'personal',
  icon: 'user',
  archived: false,
}
const SHOP: Space = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Loja',
  kind: 'business',
  icon: 'store',
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

  it('shows the current space by its icon and name, never a kind badge', async () => {
    await openMenu(SHOP)
    const trigger = screen.getByRole('button', {
      name: 'Espaço: Loja. Trocar de espaço e abrir a conta',
    })
    expect(trigger).toHaveTextContent('Lojaana@example.test')
    expect(within(trigger).getByRole('img', { name: 'Ícone: Loja' })).toBeInTheDocument()
    expect(screen.queryByText('Empresa')).not.toBeInTheDocument()
  })

  it('lists the active spaces, personal first, and switches to another one', async () => {
    actions.switchSpaceAction.mockResolvedValue({ ok: true })
    await openMenu(PERSONAL)
    const items = screen.getAllByRole('menuitem').map((i) => i.textContent?.trim())
    expect(items).toEqual(['Pessoal', 'Loja', 'Novo espaço…', 'Editar espaço…', 'Sair'])
    const shop = screen.getByRole('menuitem', { name: /Loja/ })
    expect(within(shop).getByRole('img', { name: 'Ícone: Loja' })).toBeInTheDocument()
    expect(screen.getByLabelText('atual')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('menuitem', { name: /Loja/ }))
    await waitFor(() => expect(actions.switchSpaceAction).toHaveBeenCalledWith(SHOP.id))
  })

  it('does not switch to the current space', async () => {
    await openMenu(PERSONAL)
    await userEvent.click(screen.getByRole('menuitem', { name: /Pessoal/ }))
    expect(actions.switchSpaceAction).not.toHaveBeenCalled()
  })

  it('creates a space with any name and the chosen icon from "Novo espaço…"', async () => {
    actions.createSpaceAction.mockResolvedValue({ ok: true })
    await openMenu(PERSONAL)
    await userEvent.click(screen.getByRole('menuitem', { name: 'Novo espaço…' }))
    const dialog = await screen.findByRole('dialog', { name: 'Novo espaço' })
    expect(dialog).not.toHaveTextContent('Tipo')
    const icons = screen.getAllByRole('radio')
    expect(icons).toHaveLength(10)
    expect(screen.getByRole('radio', { name: 'Trabalho' })).toHaveAttribute('aria-checked', 'true')
    await userEvent.type(screen.getByLabelText('Nome'), 'Freela')
    await userEvent.click(screen.getByRole('radio', { name: 'Freela' }))
    await userEvent.click(screen.getByRole('button', { name: 'Criar espaço' }))
    await waitFor(() =>
      expect(actions.createSpaceAction).toHaveBeenCalledWith({ name: 'Freela', icon: 'laptop' }),
    )
    expect(toast.success).toHaveBeenCalledWith('Espaço criado.')
  })

  it('renames the personal space and changes its icon, but never offers to archive it', async () => {
    actions.updateSpaceAction.mockResolvedValue({ ok: true })
    await openMenu(PERSONAL)
    expect(screen.queryByRole('menuitem', { name: /Arquivar/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Editar espaço…' }))
    await screen.findByRole('dialog', { name: 'Editar espaço' })
    expect(screen.getByRole('radio', { name: 'Pessoa' })).toHaveAttribute('aria-checked', 'true')
    const name = screen.getByLabelText('Nome')
    await userEvent.clear(name)
    await userEvent.type(name, 'Casa')
    await userEvent.click(screen.getByRole('radio', { name: 'Casa' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(actions.updateSpaceAction).toHaveBeenCalledWith({
        id: PERSONAL.id,
        name: 'Casa',
        icon: 'house',
      }),
    )
    expect(toast.success).toHaveBeenCalledWith('Espaço atualizado.')
  })

  it('archives the current non-personal space after confirming', async () => {
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
