import type { ActionResult } from '@/features/ledger/core/action-result'
import type { Space } from '@/features/spaces/core/space'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BankConnections } from './bank-connections'

const assignFeedItemAction = vi.fn<(input: unknown) => Promise<ActionResult>>()
const mapFeedAccountAction = vi.fn<(input: unknown) => Promise<ActionResult>>()
vi.mock('@/features/spaces/adapters/actions/spaces', () => ({
  assignFeedItemAction: (i: unknown) => assignFeedItemAction(i),
  mapFeedAccountAction: (i: unknown) => mapFeedAccountAction(i),
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

afterEach(() => vi.resetAllMocks())

describe('BankConnections', () => {
  it('says when there is no connection yet', () => {
    render(<BankConnections connections={[]} spaces={[PERSONAL]} />)
    expect(screen.getByText('Nenhuma conexão ainda.')).toBeInTheDocument()
  })

  it('lists each connection with its accounts and the space it syncs into', () => {
    render(
      <BankConnections
        connections={[
          {
            itemId: 'i1',
            label: 'Nubank',
            spaceId: PERSONAL.id,
            accounts: ['Conta', 'Cartão'],
            transactionCount: 3,
            feedAccounts: [],
          },
          {
            itemId: 'i2',
            label: null,
            spaceId: null,
            accounts: [],
            transactionCount: 0,
            feedAccounts: [],
          },
        ]}
        spaces={[PERSONAL, SHOP]}
      />,
    )
    const [first, second] = within(screen.getByRole('list', { name: 'Conexões' })).getAllByRole(
      'listitem',
    )
    expect(first).toHaveTextContent('Nubank')
    expect(first).toHaveTextContent('Conta, Cartão')
    expect(within(first!).getByRole('combobox', { name: 'Espaço de Nubank' })).toHaveTextContent(
      'Pessoal',
    )
    expect(second).toHaveTextContent('Conexão 2')
    expect(second).toHaveTextContent('Nenhuma conta sincronizada')
    expect(within(second!).getByRole('combobox')).toHaveTextContent('Sem espaço')
  })

  it('assigns a connection to another space', async () => {
    assignFeedItemAction.mockResolvedValue({ ok: true })
    render(
      <BankConnections
        connections={[
          {
            itemId: 'i1',
            label: 'Nubank',
            spaceId: null,
            accounts: [],
            transactionCount: 0,
            feedAccounts: [],
          },
        ]}
        spaces={[PERSONAL, SHOP]}
      />,
    )
    await userEvent.click(screen.getByRole('combobox', { name: 'Espaço de Nubank' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Loja · Empresa' }))
    await waitFor(() =>
      expect(assignFeedItemAction).toHaveBeenCalledWith({ itemId: 'i1', spaceId: SHOP.id }),
    )
    expect(toast.success).toHaveBeenCalledWith('Espaço da conexão atualizado.')
  })

  it('asks before moving a connection with data, saying how much moves', async () => {
    assignFeedItemAction.mockResolvedValue({ ok: true })
    render(
      <BankConnections
        connections={[
          {
            itemId: 'i1',
            label: 'Nubank',
            spaceId: PERSONAL.id,
            accounts: ['Conta', 'Cartão'],
            transactionCount: 1,
            feedAccounts: [],
          },
        ]}
        spaces={[PERSONAL, SHOP]}
      />,
    )
    await userEvent.click(screen.getByRole('combobox', { name: 'Espaço de Nubank' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Loja · Empresa' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Mover “Nubank” para Loja?' })
    expect(dialog).toHaveTextContent('2 contas e 1 transação vão para o espaço Loja.')
    expect(assignFeedItemAction).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Mover' }))
    await waitFor(() =>
      expect(assignFeedItemAction).toHaveBeenCalledWith({ itemId: 'i1', spaceId: SHOP.id }),
    )
  })

  it('cancels a move and pauses without asking', async () => {
    assignFeedItemAction.mockResolvedValue({ ok: true })
    render(
      <BankConnections
        connections={[
          {
            itemId: 'i1',
            label: 'Nubank',
            spaceId: PERSONAL.id,
            accounts: ['C'],
            transactionCount: 0,
            feedAccounts: [],
          },
        ]}
        spaces={[PERSONAL, SHOP]}
      />,
    )
    await userEvent.click(screen.getByRole('combobox', { name: 'Espaço de Nubank' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Loja · Empresa' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(assignFeedItemAction).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('combobox', { name: 'Espaço de Nubank' }))
    await userEvent.click(
      await screen.findByRole('option', { name: 'Sem espaço (não sincroniza)' }),
    )
    await waitFor(() =>
      expect(assignFeedItemAction).toHaveBeenCalledWith({ itemId: 'i1', spaceId: null }),
    )
  })

  describe('Conta no Fluxi', () => {
    const FEED = '00000000-0000-4000-8000-0000000000f1'
    const CHECKING = '00000000-0000-4000-8000-0000000000a1'
    const connection = (accountId: string | null, entryCount: number) => ({
      itemId: 'i1',
      label: 'BTG',
      spaceId: PERSONAL.id,
      accounts: ['Cartão BTG'],
      transactionCount: 4,
      feedAccounts: [
        {
          id: FEED,
          name: 'Cartão BTG',
          type: 'CREDIT',
          subtype: 'CREDIT_CARD',
          balanceCents: 30000,
          accountId,
          entryCount,
        },
      ],
    })
    const accounts = [
      { id: CHECKING, spaceId: PERSONAL.id, bankName: 'BTG', name: 'Conta', type: 'checking' },
      { id: 'card', spaceId: PERSONAL.id, bankName: 'BTG', name: 'Cartão', type: 'credit' },
      { id: 'other', spaceId: SHOP.id, bankName: 'Itaú', name: 'Cartão Loja', type: 'credit' },
    ]

    it('lists the bank accounts with their balance and offers compatible accounts', async () => {
      mapFeedAccountAction.mockResolvedValue({ ok: true })
      const onChanged = vi.fn()
      render(
        <BankConnections
          connections={[connection(null, 0)]}
          spaces={[PERSONAL, SHOP]}
          accounts={accounts}
          onChanged={onChanged}
        />,
      )
      expect(
        screen.getByText(/Cartão de crédito · saldo no banco -R\$\s300,00/),
      ).toBeInTheDocument()
      await userEvent.click(screen.getByRole('combobox', { name: 'Conta no Fluxi de Cartão BTG' }))
      expect(screen.queryByRole('option', { name: 'BTG · Conta' })).toBeNull()
      expect(screen.queryByRole('option', { name: 'Itaú · Cartão Loja' })).toBeNull()
      expect(screen.getByRole('option', { name: 'Criar conta' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('option', { name: 'BTG · Cartão' }))
      await waitFor(() =>
        expect(mapFeedAccountAction).toHaveBeenCalledWith({
          feedAccountId: FEED,
          target: { kind: 'account', accountId: 'card' },
        }),
      )
      await waitFor(() => expect(onChanged).toHaveBeenCalled())
    })

    it('asks before unmapping an account that already created entries', async () => {
      mapFeedAccountAction.mockResolvedValue({ ok: true })
      render(
        <BankConnections
          connections={[connection('card', 4)]}
          spaces={[PERSONAL]}
          accounts={accounts}
        />,
      )
      await userEvent.click(screen.getByRole('combobox', { name: 'Conta no Fluxi de Cartão BTG' }))
      await userEvent.click(screen.getByRole('option', { name: 'Não vincular' }))
      const dialog = await screen.findByRole('alertdialog', { name: 'Desvincular “Cartão BTG”?' })
      expect(
        within(dialog).getByText(/Os 4 lançamentos que vieram desta conta/),
      ).toBeInTheDocument()
      expect(mapFeedAccountAction).not.toHaveBeenCalled()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Desvincular' }))
      await waitFor(() =>
        expect(mapFeedAccountAction).toHaveBeenCalledWith({
          feedAccountId: FEED,
          target: { kind: 'none' },
        }),
      )
    })
  })
})
