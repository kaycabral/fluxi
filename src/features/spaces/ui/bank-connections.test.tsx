import type { ActionResult } from '@/features/ledger/core/action-result'
import type { Space } from '@/features/spaces/core/space'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BankConnections, connectionName, hasMovement, type FeedAccount } from './bank-connections'

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

const feedAccount = (over: Partial<FeedAccount>): FeedAccount => ({
  id: 'f',
  name: 'BTG Banking',
  type: 'BANK',
  subtype: 'CHECKING_ACCOUNT',
  balanceCents: 0,
  accountId: null,
  mappingSource: null,
  entryCount: 0,
  transactionCount: 0,
  ...over,
})

afterEach(() => vi.resetAllMocks())

describe('BankConnections', () => {
  it('says when there is no connection yet', () => {
    render(<BankConnections connections={[]} spaces={[PERSONAL]} />)
    expect(screen.getByText('Nenhuma conexão ainda.')).toBeInTheDocument()
  })

  it('names a connection after its institution, never "MeuPluggy"', () => {
    const base = { itemId: 'i', spaceId: null, transactionCount: 0 }
    expect(
      connectionName(
        {
          ...base,
          label: 'MeuPluggy',
          accounts: [],
          feedAccounts: [feedAccount({ name: 'itau' }), feedAccount({ name: 'Itaú Click' })],
        },
        0,
      ),
    ).toBe('Itaú')
    expect(
      connectionName({ ...base, label: 'MeuPluggy', accounts: ['BTG+'], feedAccounts: [] }, 0),
    ).toBe('BTG Pactual')
    expect(connectionName({ ...base, label: 'MeuPluggy', accounts: [], feedAccounts: [] }, 2)).toBe(
      'Conexão 3',
    )
    expect(connectionName({ ...base, label: 'Nubank', accounts: [], feedAccounts: [] }, 0)).toBe(
      'Nubank',
    )
    expect(hasMovement({ transactionCount: 0, balanceCents: 0 })).toBe(false)
    expect(hasMovement({ transactionCount: 0, balanceCents: -1 })).toBe(true)
    expect(hasMovement({ transactionCount: 2, balanceCents: 0 })).toBe(true)
  })

  it('lists each connection as a card with its space, without overflowing', () => {
    render(
      <BankConnections
        connections={[
          {
            itemId: 'i1',
            label: 'MeuPluggy',
            spaceId: PERSONAL.id,
            accounts: ['Nubank Conta', 'Nubank Cartão'],
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
    const list = screen.getByRole('list', { name: 'Conexões' })
    const [first, second] = within(list).getAllByRole('listitem')
    expect(first).toHaveTextContent('Nubank')
    expect(first).not.toHaveTextContent('MeuPluggy')
    expect(first).toHaveTextContent('Nenhuma conta sincronizada ainda')
    const space = within(first!).getByRole('combobox', { name: 'Espaço de Nubank' })
    expect(space).toHaveTextContent('Espaço:Pessoal')
    // The space control wraps under the name on narrow widths and never overflows.
    expect(space).toHaveClass('w-full', 'max-w-full', 'min-w-0', 'sm:w-auto')
    expect(first).toHaveClass('min-w-0')
    expect(second).toHaveTextContent('Conexão 2')
    expect(second).toHaveTextContent('Sem espaço: não sincroniza')
    expect(within(second!).getByRole('combobox')).toHaveTextContent('Sem espaço')
  })

  it('tells accounts apart by the last 4 digits', () => {
    render(
      <BankConnections
        connections={[
          {
            itemId: 'i1',
            label: 'BTG',
            spaceId: PERSONAL.id,
            accounts: [],
            transactionCount: 2,
            feedAccounts: [feedAccount({ transactionCount: 2, numberHint: '1234' })],
          },
        ]}
        spaces={[PERSONAL]}
      />,
    )
    expect(screen.getByText('••1234', { exact: false })).toBeInTheDocument()
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
            accounts: ['Nubank Conta', 'Nubank Cartão'],
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
            accounts: ['Nubank'],
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

  it('folds the accounts without movement away', async () => {
    render(
      <BankConnections
        connections={[
          {
            itemId: 'i1',
            label: 'MeuPluggy',
            spaceId: PERSONAL.id,
            accounts: [],
            transactionCount: 863,
            feedAccounts: [
              feedAccount({
                id: 'a',
                name: 'BTG Banking',
                transactionCount: 863,
                balanceCents: 86,
              }),
              feedAccount({ id: 'b', name: 'BTG Investimentos' }),
              feedAccount({ id: 'c', name: 'BTG Pactual Digital' }),
              feedAccount({ id: 'd', name: 'BTG+' }),
            ],
          },
        ]}
        spaces={[PERSONAL]}
      />,
    )
    const active = screen.getByRole('list', { name: 'Contas de BTG Pactual' })
    expect(within(active).getAllByRole('listitem')).toHaveLength(1)
    expect(active).toHaveTextContent('BTG Pactual · Conta corrente')
    expect(active).toHaveTextContent('Não vinculada')
    expect(screen.queryByText('BTG Pactual · Investimentos')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: '+3 contas sem movimento' }))
    const quiet = screen.getByRole('list', { name: 'Contas sem movimento de BTG Pactual' })
    expect(within(quiet).getAllByRole('listitem')).toHaveLength(3)
    expect(quiet).toHaveTextContent('BTG Pactual · Investimentos')
    await userEvent.click(screen.getByRole('button', { name: 'Esconder contas sem movimento' }))
    expect(screen.queryByRole('list', { name: /sem movimento/ })).toBeNull()
  })

  describe('Conta no Fluxi', () => {
    const FEED = '00000000-0000-4000-8000-0000000000f1'
    const CHECKING = '00000000-0000-4000-8000-0000000000a1'
    const LABEL = 'BTG Pactual · Cartão'
    const connection = (accountId: string | null, entryCount: number) => ({
      itemId: 'i1',
      label: 'MeuPluggy',
      spaceId: PERSONAL.id,
      accounts: ['BTG Cartão'],
      transactionCount: 4,
      feedAccounts: [
        feedAccount({
          id: FEED,
          name: 'BTG Cartão',
          type: 'CREDIT',
          subtype: 'CREDIT_CARD',
          balanceCents: 30000,
          accountId,
          entryCount,
          transactionCount: 4,
        }),
      ],
    })
    const accounts = [
      { id: CHECKING, spaceId: PERSONAL.id, bankName: 'BTG', name: 'Conta', type: 'checking' },
      { id: 'card', spaceId: PERSONAL.id, bankName: 'BTG', name: 'Cartão', type: 'credit' },
      { id: 'other', spaceId: SHOP.id, bankName: 'Itaú', name: 'Cartão Loja', type: 'credit' },
    ]
    const openPicker = async () => {
      await userEvent.click(screen.getByRole('button', { name: `Trocar conta de ${LABEL}` }))
      await userEvent.click(screen.getByRole('combobox', { name: `Conta no Fluxi de ${LABEL}` }))
    }

    it('shows the linked account as text and offers compatible accounts on "Trocar conta"', async () => {
      mapFeedAccountAction.mockResolvedValue({ ok: true })
      const onChanged = vi.fn()
      const { rerender } = render(
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
      expect(screen.queryByRole('combobox', { name: /Conta no Fluxi/ })).toBeNull()
      await openPicker()
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
      rerender(
        <BankConnections
          connections={[connection('card', 4)]}
          spaces={[PERSONAL, SHOP]}
          accounts={accounts}
        />,
      )
      expect(screen.getByText('→ BTG · Cartão')).toBeInTheDocument()
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
      await openPicker()
      await userEvent.click(screen.getByRole('option', { name: 'Não vincular' }))
      const dialog = await screen.findByRole('alertdialog', { name: `Desvincular “${LABEL}”?` })
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

    it('creates an account, and asks before moving entries to another one', async () => {
      mapFeedAccountAction.mockResolvedValue({ ok: true })
      const { rerender } = render(
        <BankConnections
          connections={[connection(null, 0)]}
          spaces={[PERSONAL]}
          accounts={accounts}
        />,
      )
      await openPicker()
      await userEvent.click(screen.getByRole('option', { name: 'Criar conta' }))
      await waitFor(() =>
        expect(mapFeedAccountAction).toHaveBeenCalledWith({
          feedAccountId: FEED,
          target: { kind: 'create' },
        }),
      )
      rerender(
        <BankConnections
          connections={[connection('card', 2)]}
          spaces={[PERSONAL]}
          accounts={[
            ...accounts,
            {
              id: 'card2',
              spaceId: PERSONAL.id,
              bankName: 'BTG',
              name: 'Cartão 2',
              type: 'credit',
            },
          ]}
        />,
      )
      await openPicker()
      await userEvent.click(screen.getByRole('option', { name: 'BTG · Cartão 2' }))
      const dialog = await screen.findByRole('alertdialog', {
        name: `Vincular “${LABEL}” a Cartão 2?`,
      })
      expect(within(dialog).getByText(/criados de novo na conta escolhida/)).toBeInTheDocument()
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
      expect(mapFeedAccountAction).toHaveBeenCalledOnce()
    })
  })
})
