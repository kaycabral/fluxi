import { INITIAL_FORM_STATE, type FormState } from '@/features/ledger/core/action-result'
import { DEFAULT_POTS } from '@/features/ledger/core/defaults'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BudgetView, type BudgetMonthSummary } from './budget-view'

const setPotTargetsAction = vi.fn<(prev: FormState, data: FormData) => Promise<FormState>>()
vi.mock('@/features/ledger/adapters/actions/settings', () => ({
  setPotTargetsAction: (p: FormState, d: FormData) => setPotTargetsAction(p, d),
}))
const toast = { success: vi.fn<(m: string) => void>(), error: vi.fn<(m: string) => void>() }
vi.mock('sonner', () => ({
  toast: { success: (m: string) => toast.success(m), error: (m: string) => toast.error(m) },
}))

const byPot = {
  essential: 330000,
  comfort: 100000,
  guilt_free: 70000,
  education: 0,
  variable: 80000,
  investment: 250000,
}
const months: BudgetMonthSummary[] = [
  { month: '2026-12', incomeCents: 1000000, byPot },
  { month: '2027-01', incomeCents: 0, byPot },
]

beforeEach(() => setPotTargetsAction.mockResolvedValue({ ok: true, error: null, savedAt: 1 }))
afterEach(() => vi.clearAllMocks())

describe('BudgetView', () => {
  it('shows what is left to distribute and the per-pot hints', () => {
    render(<BudgetView pots={[...DEFAULT_POTS]} months={months} />)
    expect(screen.getByText('10% livre para distribuir')).toBeInTheDocument()
    expect(
      screen.getByText(/meta R\$ 3\.300,00 · planejado em dez\/26 R\$ 3\.300,00 \(33%\) · até 43%/),
    ).toBeInTheDocument()
  })

  it('clamps a slider so the sum never passes 100%', () => {
    render(<BudgetView pots={[...DEFAULT_POTS]} months={months} />)
    const comfort = screen.getByLabelText('Conforto')
    fireEvent.change(comfort, { target: { value: '90' } })
    expect(comfort).toHaveValue('17')
    expect(screen.getByText('100% distribuído')).toBeInTheDocument()
  })

  it('colors the traffic light (investment inverted)', () => {
    render(<BudgetView pots={[...DEFAULT_POTS]} months={months} />)
    expect(screen.getAllByTitle('dentro da meta').length).toBeGreaterThan(0)
    expect(screen.getAllByTitle('fora da meta').length).toBeGreaterThan(0)
  })

  it('saves the targets in basis points, or undoes the changes', async () => {
    render(<BudgetView pots={[...DEFAULT_POTS]} months={months} />)
    const save = screen.getByRole('button', { name: 'Salvar metas' })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Educação'), { target: { value: '5' } })
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    expect(screen.getByLabelText('Educação')).toHaveValue('3')

    fireEvent.change(screen.getByLabelText('Educação'), { target: { value: '5' } })
    await userEvent.click(save)
    await waitFor(() => expect(setPotTargetsAction).toHaveBeenCalledOnce())
    expect(setPotTargetsAction.mock.calls[0]?.[1].get('education')).toBe('500')
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Metas salvas.'))
  })

  it('reports a refused save', async () => {
    setPotTargetsAction.mockResolvedValue({
      ...INITIAL_FORM_STATE,
      error: 'A soma dos potes não pode passar de 100%.',
    })
    render(<BudgetView pots={[...DEFAULT_POTS]} months={[]} />)
    fireEvent.change(screen.getByLabelText('Educação'), { target: { value: '5' } })
    await userEvent.click(screen.getByRole('button', { name: 'Salvar metas' }))
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('A soma dos potes não pode passar de 100%.'),
    )
  })
})
