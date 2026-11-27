import type { ActionResult } from '@/features/ledger/core/action-result'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountsSettings } from './accounts-settings'

const renameAccountAction = vi.fn<(input: unknown) => Promise<ActionResult>>()
const setAccountArchivedAction = vi.fn<(input: unknown) => Promise<ActionResult>>()
const addAccountAction = vi.fn<(input: unknown) => Promise<ActionResult>>()
vi.mock('@/features/ledger/adapters/actions/accounts', () => ({
  addAccountAction: (i: unknown) => addAccountAction(i),
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
  it('says when the space has no active account and opens the form for the first one', () => {
    render(<AccountsSettings data={{ banks: [], accounts: [] }} />)
    expect(screen.getByText(/^Nenhuma conta ativa neste espaço\./)).toBeInTheDocument()
    const form = screen.getByRole('form', { name: 'Nova conta' })
    // No bank yet: the bank is typed, not picked.
    expect(within(form).getByLabelText('Banco')).toHaveRole('textbox')
  })

  it('creates the first account in a new bank', async () => {
    addAccountAction.mockResolvedValue({ ok: true })
    const onChanged = vi.fn()
    render(<AccountsSettings data={{ banks: [], accounts: [] }} onChanged={onChanged} />)
    await userEvent.type(screen.getByLabelText('Banco'), 'Nubank')
    await userEvent.type(screen.getByLabelText('Nome da conta'), 'Conta corrente')
    await userEvent.type(screen.getByLabelText('Saldo inicial'), '-12,50')
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
    expect(addAccountAction).toHaveBeenCalledWith(
      expect.objectContaining({
        newBankName: 'Nubank',
        name: 'Conta corrente',
        type: 'checking',
        openingBalanceCents: -1250,
      }),
    )
  })

  it('adds an account to an existing bank from "Nova conta", refusing a bad opening balance', async () => {
    addAccountAction.mockResolvedValue({ ok: true })
    render(<AccountsSettings data={{ banks: [BANK], accounts: [account({})] }} />)
    expect(screen.queryByRole('form', { name: 'Nova conta' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Nova conta' }))
    await userEvent.type(screen.getByLabelText('Nome da conta'), 'Poupança')
    await userEvent.type(screen.getByLabelText('Saldo inicial'), 'abc')
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
    expect(screen.getByText('Saldo inicial inválido.')).toBeInTheDocument()
    expect(addAccountAction).not.toHaveBeenCalled()
    await userEvent.clear(screen.getByLabelText('Saldo inicial'))
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
    await waitFor(() =>
      expect(addAccountAction).toHaveBeenCalledWith(
        expect.objectContaining({ bankId: 'b1', newBankName: null, openingBalanceCents: 0 }),
      ),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Nova conta' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('form', { name: 'Nova conta' })).not.toBeInTheDocument()
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
      'A conta e todas as transações dela deixam de contar em qualquer lugar: saldos, totais, orçamento, calendário e lista de transações. Nada é apagado: ao desarquivar, em “Arquivadas”, tudo volta como estava.',
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
