import type { AccountsData } from '@/features/ledger/adapters/actions/accounts'
import type { ActionResult } from '@/features/ledger/core/action-result'
import type { CategorizationRule } from '@/features/ledger/core/similar'
import type { ConnectionsData } from '@/features/spaces/adapters/actions/spaces'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsModal, settingsHash } from './settings-modal'

type Loaded = { ok: true; data: ConnectionsData } | { ok: false; error: string }
const loadConnectionsAction = vi.fn<() => Promise<Loaded>>()
const assignFeedItemAction = vi.fn<(input: unknown) => Promise<ActionResult>>()
type RulesLoaded = { ok: true; data: CategorizationRule[] } | { ok: false; error: string }
const loadRulesAction = vi.fn<() => Promise<RulesLoaded>>()
vi.mock('@/features/ledger/adapters/actions/categorize', () => ({
  loadRulesAction: () => loadRulesAction(),
  deleteRuleAction: vi.fn(),
}))
vi.mock('@/features/spaces/adapters/actions/spaces', () => ({
  loadConnectionsAction: () => loadConnectionsAction(),
  assignFeedItemAction: (i: unknown) => assignFeedItemAction(i),
}))
type AccountsLoaded = { ok: true; data: AccountsData } | { ok: false; error: string }
const loadAccountsAction = vi.fn<() => Promise<AccountsLoaded>>()
const setAccountArchivedAction = vi.fn<(input: unknown) => Promise<ActionResult>>()
const renameAccountAction = vi.fn<(input: unknown) => Promise<ActionResult>>()
vi.mock('@/features/ledger/adapters/actions/accounts', () => ({
  loadAccountsAction: () => loadAccountsAction(),
  setAccountArchivedAction: (i: unknown) => setAccountArchivedAction(i),
  renameAccountAction: (i: unknown) => renameAccountAction(i),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const PERSONAL = { id: '00000000-0000-4000-8000-000000000001', name: 'Pessoal' } as const
const DATA: ConnectionsData = {
  connections: [
    {
      itemId: 'i1',
      label: 'Nubank',
      spaceId: PERSONAL.id,
      accounts: [],
      transactionCount: 0,
      feedAccounts: [],
    },
  ],
  spaces: [{ ...PERSONAL, kind: 'personal', archived: false }],
  accounts: [],
}

function openAt(hash: string) {
  window.history.replaceState(null, '', `/painel${hash}`)
  render(<SettingsModal />)
}

afterEach(() => {
  vi.resetAllMocks()
  window.history.replaceState(null, '', '/painel')
})

describe('SettingsModal', () => {
  it('stays closed without the settings fragment', () => {
    openAt('')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(loadConnectionsAction).not.toHaveBeenCalled()
  })

  it('opens on #configuracoes/conexoes with the sections nav and the connections', async () => {
    loadConnectionsAction.mockResolvedValue({ ok: true, data: DATA })
    openAt(settingsHash('conexoes'))
    const dialog = await screen.findByRole('dialog', { name: 'Conexões' })
    expect(
      within(screen.getByRole('navigation', { name: 'Seções de configuração' })).getByRole(
        'button',
        { name: 'Conexões' },
      ),
    ).toHaveAttribute('aria-current', 'page')
    expect(await within(dialog).findByRole('combobox', { name: 'Espaço de Nubank' })).toBeVisible()

    // Picking the section keeps the fragment; pausing reloads the data.
    await userEvent.click(screen.getByRole('button', { name: 'Conexões' }))
    expect(window.location.hash).toBe('#configuracoes/conexoes')
    assignFeedItemAction.mockResolvedValue({ ok: true })
    await userEvent.click(screen.getByRole('combobox', { name: 'Espaço de Nubank' }))
    await userEvent.click(
      await screen.findByRole('option', { name: 'Sem espaço (não sincroniza)' }),
    )
    await waitFor(() => expect(loadConnectionsAction).toHaveBeenCalledTimes(2))

    // Closing clears the fragment.
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(window.location.hash).toBe('')
  })

  it('ignores an unknown section and a load that ends after closing', async () => {
    openAt('#configuracoes/perfil')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    let finish: (value: Loaded) => void = () => undefined
    loadConnectionsAction.mockReturnValue(
      new Promise<Loaded>((resolve) => {
        finish = resolve
      }),
    )
    act(() => {
      window.location.hash = settingsHash('conexoes')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(await screen.findByLabelText('Carregando')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await act(async () => {
      finish({ ok: true, data: DATA })
      await Promise.resolve()
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('follows the fragment and retries when loading fails', async () => {
    loadConnectionsAction.mockRejectedValueOnce(new Error('db down'))
    openAt('')
    act(() => {
      window.location.hash = settingsHash('conexoes')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(await screen.findByText('Não foi possível carregar as conexões.')).toBeInTheDocument()
    loadConnectionsAction.mockResolvedValue({ ok: false, error: 'Sessão expirada.' })
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Sessão expirada.')).toBeInTheDocument()
  })

  it('manages the accounts of the space: rename, archive with a warning, unarchive', async () => {
    const BANK = '00000000-0000-4000-8000-0000000000b1'
    loadAccountsAction.mockResolvedValue({
      ok: true,
      data: {
        banks: [{ id: BANK, name: 'BTG', sort: 0, archived: false }],
        accounts: [
          {
            id: 'a1',
            bankId: BANK,
            name: 'Conta',
            type: 'checking',
            archived: false,
            balanceCents: 123456,
            connected: false,
          },
          {
            id: 'a2',
            bankId: BANK,
            name: 'Cartão',
            type: 'credit',
            archived: false,
            balanceCents: -5000,
            connected: true,
          },
          {
            id: 'a3',
            bankId: BANK,
            name: 'Antiga',
            type: 'checking',
            archived: true,
            balanceCents: 0,
            connected: false,
          },
        ],
      },
    })
    setAccountArchivedAction.mockResolvedValue({ ok: true })
    renameAccountAction.mockResolvedValue({ ok: true })
    openAt(settingsHash('contas'))
    const dialog = await screen.findByRole('dialog', { name: 'Contas' })
    const btg = await within(dialog).findByRole('region', { name: 'BTG' })
    expect(within(btg).getByText(/Conta corrente · saldo hoje/)).toBeInTheDocument()
    expect(within(btg).getByRole('button', { name: 'Arquivar Cartão' })).toBeDisabled()

    await userEvent.click(within(btg).getByRole('button', { name: 'Renomear Conta' }))
    const input = within(btg).getByLabelText('Nome de Conta')
    await userEvent.clear(input)
    await userEvent.type(input, 'Conta BTG{Enter}')
    await waitFor(() =>
      expect(renameAccountAction).toHaveBeenCalledWith({ id: 'a1', name: 'Conta BTG' }),
    )

    await userEvent.click(within(btg).getByRole('button', { name: 'Arquivar Conta' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Arquivar “Conta”?' })
    expect(within(confirm).getByText(/deixam de contar em qualquer lugar/)).toBeInTheDocument()
    await userEvent.click(within(confirm).getByRole('button', { name: 'Arquivar' }))
    await waitFor(() =>
      expect(setAccountArchivedAction).toHaveBeenCalledWith({ id: 'a1', archived: true }),
    )

    await userEvent.click(within(dialog).getByRole('button', { name: 'Arquivadas (1)' }))
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Desarquivar Antiga' }))
    await waitFor(() =>
      expect(setAccountArchivedAction).toHaveBeenCalledWith({ id: 'a3', archived: false }),
    )
  })

  it('offers to retry when the accounts cannot be loaded', async () => {
    loadAccountsAction.mockRejectedValue(new Error('down'))
    openAt(settingsHash('contas'))
    const dialog = await screen.findByRole('dialog', { name: 'Contas' })
    expect(await within(dialog).findByText('Não foi possível carregar as contas.')).toBeVisible()
    expect(within(dialog).getByRole('button', { name: 'Tentar de novo' })).toBeVisible()
  })

  it('lists the rules of the space', async () => {
    loadRulesAction.mockResolvedValue({
      ok: true,
      data: [
        {
          id: 'r1',
          pattern: 'atm veneza',
          minCents: 800,
          maxCents: 1500,
          categoryId: 'c1',
          categoryName: 'Padaria',
          pot: null,
          potName: null,
        },
      ],
    })
    openAt(settingsHash('regras'))
    const dialog = await screen.findByRole('dialog', { name: 'Regras' })
    expect(await within(dialog).findByText('“atm veneza”')).toBeVisible()
  })

  it('offers to retry when the rules cannot be loaded', async () => {
    loadRulesAction.mockRejectedValue(new Error('down'))
    openAt(settingsHash('regras'))
    const dialog = await screen.findByRole('dialog', { name: 'Regras' })
    expect(await within(dialog).findByText('Não foi possível carregar as regras.')).toBeVisible()
  })
})
