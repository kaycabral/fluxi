import type { ActionResult } from '@/features/ledger/core/action-result'
import type { ConnectionsData } from '@/features/spaces/adapters/actions/spaces'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsModal, settingsHash } from './settings-modal'

type Loaded = { ok: true; data: ConnectionsData } | { ok: false; error: string }
const loadConnectionsAction = vi.fn<() => Promise<Loaded>>()
const assignFeedItemAction = vi.fn<(input: unknown) => Promise<ActionResult>>()
vi.mock('@/features/spaces/adapters/actions/spaces', () => ({
  loadConnectionsAction: () => loadConnectionsAction(),
  assignFeedItemAction: (i: unknown) => assignFeedItemAction(i),
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
})
