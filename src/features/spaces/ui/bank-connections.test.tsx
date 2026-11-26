import type { ActionResult } from '@/features/ledger/core/action-result'
import type { Space } from '@/features/spaces/core/space'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BankConnections } from './bank-connections'

const assignFeedItemAction = vi.fn<(input: unknown) => Promise<ActionResult>>()
vi.mock('@/features/spaces/adapters/actions/spaces', () => ({
  assignFeedItemAction: (i: unknown) => assignFeedItemAction(i),
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
    expect(screen.getByText('Nenhuma conexão bancária ainda.')).toBeInTheDocument()
  })

  it('lists each connection with its accounts and the space it syncs into', () => {
    render(
      <BankConnections
        connections={[
          { itemId: 'i1', label: 'Nubank', spaceId: PERSONAL.id, accounts: ['Conta', 'Cartão'] },
          { itemId: 'i2', label: null, spaceId: null, accounts: [] },
        ]}
        spaces={[PERSONAL, SHOP]}
      />,
    )
    const [first, second] = within(
      screen.getByRole('list', { name: 'Conexões bancárias' }),
    ).getAllByRole('listitem')
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
        connections={[{ itemId: 'i1', label: 'Nubank', spaceId: null, accounts: [] }]}
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
})
