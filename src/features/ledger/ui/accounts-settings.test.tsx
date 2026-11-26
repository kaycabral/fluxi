import type { ActionResult } from '@/features/ledger/core/action-result'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountsSettings } from './accounts-settings'

const renameAccountAction = vi.fn<(input: unknown) => Promise<ActionResult>>()
const setAccountArchivedAction = vi.fn<(input: unknown) => Promise<ActionResult>>()
vi.mock('@/features/ledger/adapters/actions/accounts', () => ({
  renameAccountAction: (i: unknown) => renameAccountAction(i),
  setAccountArchivedAction: (i: unknown) => setAccountArchivedAction(i),
}))
const toastError = vi.fn<(m: string) => void>()
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (m: string) => toastError(m) } }))

const BANK = { id: 'b1', name: 'BTG', sort: 0, archived: false }
const account = (
  over: Partial<Parameters<typeof AccountsSettings>[0]['data']['accounts'][number]>,
) => ({
  id: 'a1',
  bankId: BANK.id,
  name: 'Conta',
  type: 'checking' as const,
  archived: false,
  balanceCents: -100,
  connected: false,
  ...over,
})

afterEach(() => vi.resetAllMocks())

describe('AccountsSettings', () => {
  it('says when the space has no active account', () => {
    render(<AccountsSettings data={{ banks: [BANK], accounts: [] }} />)
    expect(screen.getByText('Nenhuma conta ativa neste espaço.')).toBeInTheDocument()
  })

  it('keeps the name on Escape or blank, and explains a connected account', async () => {
    render(
      <AccountsSettings
        data={{
          banks: [BANK],
          accounts: [
            account({}),
            account({ id: 'a2', name: 'Cartão', connected: true, numberHints: ['4821'] }),
          ],
        }}
      />,
    )
    expect(screen.getByText(/Vinculada ao banco: desvincule em Conexões/)).toBeInTheDocument()
    expect(screen.getByText(/vinculada a ••4821/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Renomear Conta' }))
    const input = screen.getByLabelText('Nome de Conta')
    await userEvent.clear(input)
    await userEvent.type(input, 'Outro{Escape}')
    expect(screen.getByText('Conta')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Renomear Conta' }))
    const again = screen.getByLabelText('Nome de Conta')
    await userEvent.clear(again)
    fireEvent.blur(again)
    expect(renameAccountAction).not.toHaveBeenCalled()
    expect(
      within(screen.getByRole('region', { name: 'BTG' })).getByText('Conta'),
    ).toBeInTheDocument()
  })

  it('lists an archived account as out of the balances and totals', async () => {
    render(
      <AccountsSettings
        data={{ banks: [BANK], accounts: [account({ id: 'a2', name: 'Velha', archived: true })] }}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Arquivadas/ }))
    expect(screen.getByText(/fora dos saldos e totais/)).toBeInTheDocument()
  })

  it('explains that an archived account and its entries stop counting anywhere', async () => {
    render(<AccountsSettings data={{ banks: [BANK], accounts: [account({})] }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Arquivar Conta' }))
    const dialog = await screen.findByRole('alertdialog')
    expect(dialog).toHaveTextContent(
      'A conta e todos os lançamentos dela deixam de contar em qualquer lugar: saldos, totais, orçamento, calendário e lista de lançamentos. Nada é apagado: ao desarquivar, em “Arquivadas”, tudo volta como estava.',
    )
  })

  it('reports a refused archive', async () => {
    setAccountArchivedAction.mockResolvedValue({ ok: false, error: 'Não deu.' })
    render(<AccountsSettings data={{ banks: [BANK], accounts: [account({})] }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Arquivar Conta' }))
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Arquivar' }),
    )
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Não deu.'))
  })
})
