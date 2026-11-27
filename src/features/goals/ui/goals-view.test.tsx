import type { Goal } from '@/features/goals/core/goals'
import type { ActionResult } from '@/features/ledger/core/action-result'
import type { BudgetVersion } from '@/features/ledger/core/types'
import { sampleData } from '@/features/ledger/ui/test-fixtures'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { duration, short } from './format'
import { GoalsView } from './goals-view'

const actions = {
  saveGoalAction: vi.fn<(input: unknown) => Promise<ActionResult>>(),
  deleteGoalAction: vi.fn<(input: unknown) => Promise<ActionResult>>(),
}
vi.mock('@/features/goals/adapters/actions/goals', () => ({
  saveGoalAction: (i: unknown) => actions.saveGoalAction(i),
  deleteGoalAction: (i: unknown) => actions.deleteGoalAction(i),
}))
const toast = { success: vi.fn<(m: string) => void>(), error: vi.fn<(m: string) => void>() }
vi.mock('sonner', () => ({
  toast: { success: (m: string) => toast.success(m), error: (m: string) => toast.error(m) },
}))

const VERSION: BudgetVersion = {
  id: '00000000-0000-4000-8000-00000000aa01',
  startsMonth: '2026-01',
  targets: { essential: 5000, guilt_free: 1500, investment: 2500, goals: 1000 },
}
const goal = (over: Partial<Goal>): Goal => ({
  id: '00000000-0000-4000-8000-00000000f001',
  name: 'Objetivo',
  kind: 'purchase',
  budgetGroup: 'goals',
  targetCents: null,
  targetMonth: null,
  monthlyCents: null,
  initialCents: 0,
  withdrawalBps: 400,
  accountId: null,
  startMonth: '2027-03',
  sort: 0,
  ...over,
})
const TRIP = goal({
  id: '00000000-0000-4000-8000-00000000f002',
  name: 'Viagem anual',
  kind: 'recurring',
  targetCents: 1_200_000,
  targetMonth: '2027-07',
  monthlyCents: 20_000,
})
const FI = goal({
  id: '00000000-0000-4000-8000-00000000f003',
  name: 'Independência financeira',
  kind: 'independence',
  budgetGroup: 'investment',
  initialCents: 1_000_000,
})
const EMERGENCY = goal({
  id: '00000000-0000-4000-8000-00000000f004',
  name: 'Reserva de emergência',
  kind: 'emergency',
  budgetGroup: 'investment',
  monthlyCents: 30_000,
})

/** Server actions resolve in a transition; give a loaded machine room. */
const SLOW = { timeout: 5_000 }

function renderGoals(goals: Goal[], versions: BudgetVersion[] = [VERSION]) {
  return render(<GoalsView data={sampleData()} versions={versions} goals={goals} today="2027-03" />)
}

beforeEach(() => {
  for (const action of Object.values(actions)) action.mockResolvedValue({ ok: true })
})
afterEach(() => vi.clearAllMocks())

describe('GoalsView', () => {
  it('shows each minimum budget group as a pot with its goals', () => {
    renderGoals([TRIP, FI, EMERGENCY])
    expect(screen.getByRole('heading', { name: 'Investimento' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Metas' })).toBeInTheDocument()
    expect(screen.getByText('Recebe o resto')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Viagem anual/ })).toHaveTextContent('todo ano')
    expect(screen.getByText('Padrão de vida')).toBeInTheDocument()
  })

  it('explains an empty screen and a budget group at 0%', () => {
    const { unmount } = renderGoals([])
    expect(screen.getByText(/Diga o quê e quando/)).toBeInTheDocument()
    unmount()
    renderGoals([TRIP], [{ ...VERSION, targets: { ...VERSION.targets, goals: 0 } }])
    expect(screen.getByRole('link', { name: 'Defina um % no Orçamento' })).toHaveAttribute(
      'href',
      '/painel/orcamento',
    )
  })

  it('warns when the slices ask for more than the budget group has', () => {
    renderGoals([{ ...TRIP, monthlyCents: 10_000_000 }])
    expect(screen.getByText(/a mais que o grupo/)).toBeInTheDocument()
    expect(screen.getByText(/pedem mais do que o orçamento separa/)).toBeInTheDocument()
  })

  it('creates a yearly goal in Metas with a live preview', async () => {
    renderGoals([FI])
    await userEvent.click(screen.getByRole('button', { name: /Novo objetivo/ }))
    await userEvent.click(screen.getByRole('radio', { name: /Todo ano/ }))
    expect(screen.getByLabelText('Nome')).toHaveValue('Todo ano')
    await userEvent.clear(screen.getByLabelText('Nome'))
    await userEvent.type(screen.getByLabelText('Nome'), 'Viagem')
    await userEvent.type(screen.getByLabelText('Quanto custa por ano'), '1200000')
    fireEvent.change(screen.getByLabelText('Próxima vez'), { target: { value: '2028-03' } })
    expect(screen.getByText(/Precisa de/)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Fatia por mês'), '200000')
    expect(screen.getByText(/Cabe:/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(actions.saveGoalAction).toHaveBeenCalledOnce())
    expect(actions.saveGoalAction.mock.calls[0]?.[0]).toMatchObject({
      id: null,
      name: 'Viagem',
      kind: 'recurring',
      budgetGroup: 'goals',
      targetCents: 1_200_000,
      targetMonth: '2028-03',
      monthlyCents: 200_000,
    })
    expect(toast.success).toHaveBeenCalledWith('Objetivo criado.')
  })

  it('plans independence from the standard of living and an emergency fund by its slice', async () => {
    renderGoals([])
    await userEvent.click(screen.getByRole('button', { name: /Novo objetivo/ }))
    await userEvent.click(screen.getByRole('radio', { name: /Independência/ }))
    expect(screen.getByLabelText('Renda mensal desejada')).toHaveAttribute(
      'placeholder',
      expect.stringContaining('padrão de vida'),
    )
    expect(screen.getByLabelText('Taxa de retirada (% ao ano)')).toHaveValue('4')
    await userEvent.type(screen.getByLabelText('Renda mensal desejada'), '500000')
    expect(screen.getByText(/Marco no caminho/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: /Reserva de emergência/ }))
    await userEvent.type(screen.getByLabelText('Fatia por mês'), '50000')
    expect(screen.getByText(/completa em/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('edits a goal without changing its kind, toasting a server error', async () => {
    actions.saveGoalAction.mockResolvedValueOnce({ ok: false, error: 'Grupo inválido.' })
    renderGoals([TRIP])
    await userEvent.click(screen.getByRole('button', { name: /Viagem anual/ }))
    expect(screen.queryByRole('radio')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Grupo inválido.'), SLOW)
    expect(actions.saveGoalAction.mock.calls[0]?.[0]).toMatchObject({ id: TRIP.id })
  })

  it('gives independence what the other slices leave, and closes on Escape', async () => {
    renderGoals([EMERGENCY])
    await userEvent.click(screen.getByRole('button', { name: /Novo objetivo/ }))
    await userEvent.click(screen.getByRole('radio', { name: /Independência/ }))
    fireEvent.change(screen.getByLabelText('Taxa de retirada (% ao ano)'), {
      target: { value: '3,5' },
    })
    await userEvent.type(screen.getByLabelText('Já tenho guardado'), '1000000')
    await userEvent.type(screen.getByLabelText('Renda mensal desejada'), '500000')
    expect(screen.getByText(/Juntar/)).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('marks a reached goal and waits for a first month with income', () => {
    const { unmount } = renderGoals([{ ...TRIP, initialCents: 1_500_000 }])
    expect(screen.getByText(/meta atingida/)).toBeInTheDocument()
    unmount()
    render(
      <GoalsView
        data={sampleData({ entries: [] })}
        versions={[VERSION]}
        goals={[]}
        today="2027-03"
      />,
    )
    expect(screen.getByText(/Ainda não há meses completos/)).toBeInTheDocument()
  })

  it('deletes a goal', async () => {
    renderGoals([TRIP])
    await userEvent.click(screen.getByRole('button', { name: /Viagem anual/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Excluir' }))
    await waitFor(() => expect(actions.deleteGoalAction).toHaveBeenCalledWith(TRIP.id), SLOW)
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Objetivo excluído.'), SLOW)
  })
})

describe('labels', () => {
  it('shortens money and durations', () => {
    expect(short(270_000_000)).toBe('R$ 2,70 mi')
    expect(short(9_500_000)).toBe('R$ 95 mil')
    expect(short(50_000)).toMatch(/^R\$\s500,00$/)
    expect(duration(null)).toBe('mais de 70 anos')
    expect(duration(0)).toBe('já')
    expect(duration(1)).toBe('1 mês')
    expect(duration(30)).toBe('2,5 anos')
  })
})
