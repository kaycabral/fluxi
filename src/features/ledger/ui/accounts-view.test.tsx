import { INITIAL_FORM_STATE, type FormState } from '@/features/ledger/core/action-result'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountsView, type AccountsViewProps } from './accounts-view'
import { IDS, sampleData } from './test-fixtures'

const saveBankAction = vi.fn<(prev: FormState, data: FormData) => Promise<FormState>>()
const saveAccountAction = vi.fn<(prev: FormState, data: FormData) => Promise<FormState>>()
vi.mock('@/features/ledger/adapters/actions/accounts', () => ({
  saveBankAction: (p: FormState, d: FormData) => saveBankAction(p, d),
  saveAccountAction: (p: FormState, d: FormData) => saveAccountAction(p, d),
}))
const toast = { success: vi.fn<(m: string) => void>(), error: vi.fn<(m: string) => void>() }
vi.mock('sonner', () => ({
  toast: { success: (m: string) => toast.success(m), error: (m: string) => toast.error(m) },
}))

const NEW_BANK = '00000000-0000-4000-8000-00000000ff01'
const NEW_ACCOUNT = '00000000-0000-4000-8000-00000000ff02'

function props(overrides: Partial<AccountsViewProps> = {}): AccountsViewProps {
  const data = sampleData()
  return {
    banks: data.banks,
    accounts: data.accounts,
    firstMonth: '2026-12',
    laterMonth: '2027-12',
    firstClosing: { [IDS.cc]: 50000, [IDS.card]: -1000, [IDS.nucc]: 20000, [IDS.old]: 0 },
    laterClosing: null,
    newBankId: NEW_BANK,
    newAccountId: NEW_ACCOUNT,
    ...overrides,
  }
}

const ok: FormState = { ok: true, error: null, savedAt: 1 }

beforeEach(() => {
  saveBankAction.mockResolvedValue(ok)
  saveAccountAction.mockResolvedValue(ok)
})
afterEach(() => vi.clearAllMocks())

describe('AccountsView', () => {
  it('lists banks with their accounts and balances', () => {
    render(<AccountsView {...props()} />)
    const [btg, nubank] = screen.getAllByLabelText('Nome do banco')
    expect(btg).toHaveValue('BTG')
    expect(nubank).toHaveValue('Nubank')
    expect(screen.getByDisplayValue('Cartão')).toBeInTheDocument()
    expect(screen.getByText('-R$ 10')).toBeInTheDocument()
    expect(screen.getAllByText('Fim de dez/27').length).toBeGreaterThan(0)
    expect(screen.getByText(/no dia 1º de dez\/26/)).toBeInTheDocument()
  })

  it('saves a renamed bank on blur', async () => {
    render(<AccountsView {...props()} />)
    const [btg] = screen.getAllByLabelText('Nome do banco')
    if (btg === undefined) throw new Error('no bank input')
    await userEvent.clear(btg)
    await userEvent.type(btg, 'BTG Pactual')
    await userEvent.tab()
    await waitFor(() => expect(saveBankAction).toHaveBeenCalledOnce())
    const data = saveBankAction.mock.calls[0]?.[1]
    expect(data?.get('id')).toBe(IDS.btg)
    expect(data?.get('name')).toBe('BTG Pactual')
  })

  it('saves an account when a field changes and reports errors', async () => {
    saveAccountAction.mockResolvedValue({ ...INITIAL_FORM_STATE, error: 'Saldo inicial inválido.' })
    render(<AccountsView {...props()} />)
    const opening = screen.getByLabelText('Saldo inicial', { selector: `#acc-opening-${IDS.cc}` })
    await userEvent.clear(opening)
    await userEvent.type(opening, '-50')
    await userEvent.tab()
    await waitFor(() => expect(saveAccountAction).toHaveBeenCalledOnce())
    const data = saveAccountAction.mock.calls[0]?.[1]
    expect(data?.get('openingBalance')).toBe('-50')
    expect(data?.get('active')).toBe('on')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Saldo inicial inválido.'))
  })

  it('archives an account and changes its type', async () => {
    render(<AccountsView {...props()} />)
    await userEvent.click(screen.getByLabelText('Ativa', { selector: `#acc-active-${IDS.nucc}` }))
    await waitFor(() => expect(saveAccountAction).toHaveBeenCalled())
    expect(saveAccountAction.mock.calls.at(-1)?.[1].get('active')).toBeNull()

    saveAccountAction.mockClear()
    await userEvent.click(screen.getByLabelText('Tipo', { selector: `#acc-type-${IDS.cc}` }))
    await userEvent.click(await screen.findByRole('option', { name: 'Investimento' }))
    await waitFor(() => expect(saveAccountAction).toHaveBeenCalled())
    expect(saveAccountAction.mock.calls.at(-1)?.[1].get('type')).toBe('investment')
  })

  it('creates a bank and an account with server-minted ids', async () => {
    render(<AccountsView {...props()} />)
    await userEvent.type(screen.getByLabelText('Novo banco'), 'Inter')
    await userEvent.click(screen.getByRole('button', { name: 'Banco' }))
    await waitFor(() => expect(saveBankAction).toHaveBeenCalledOnce())
    expect(Object.fromEntries(saveBankAction.mock.calls[0]?.[1] ?? [])).toMatchObject({
      intent: 'create',
      id: NEW_BANK,
      name: 'Inter',
    })
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Banco criado.'))

    await userEvent.click(screen.getByLabelText('Banco'))
    await userEvent.click(await screen.findByRole('option', { name: 'BTG' }))
    await userEvent.click(screen.getByLabelText('Tipo', { selector: '#new-account-type' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Cartão de crédito' }))
    await userEvent.type(screen.getByLabelText('Nova conta'), 'Black')
    await userEvent.click(screen.getByRole('button', { name: 'Conta' }))
    await waitFor(() => expect(saveAccountAction).toHaveBeenCalledOnce())
    expect(Object.fromEntries(saveAccountAction.mock.calls[0]?.[1] ?? [])).toMatchObject({
      intent: 'create',
      id: NEW_ACCOUNT,
      bankId: IDS.btg,
      type: 'credit',
      name: 'Black',
    })
  })

  it('hides the account form without banks', () => {
    render(<AccountsView {...props({ banks: [], accounts: [] })} />)
    expect(screen.queryByLabelText('Nova conta')).not.toBeInTheDocument()
  })

  it('says when a bank has no accounts', () => {
    render(<AccountsView {...props({ accounts: [], firstClosing: null })} />)
    expect(screen.getAllByText('Nenhuma conta neste banco ainda.')).toHaveLength(2)
  })
})
