import type { ActionResult } from '@/features/ledger/core/action-result'
import { DEFAULT_POTS } from '@/features/ledger/core/defaults'
import type { BudgetPlan } from '@/features/ledger/core/types'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BudgetView } from './budget-view'
import { sampleData } from './test-fixtures'

const actions = {
  createPotAction: vi.fn<(input: unknown) => Promise<ActionResult>>(),
  updatePotAction: vi.fn<(input: unknown) => Promise<ActionResult>>(),
  removePotAction: vi.fn<(input: unknown) => Promise<ActionResult & { archived?: boolean }>>(),
  saveBudgetPlanAction: vi.fn<(input: unknown) => Promise<ActionResult>>(),
  deleteBudgetPlanAction: vi.fn<(input: unknown) => Promise<ActionResult>>(),
}
vi.mock('@/features/ledger/adapters/actions/budget', () => ({
  createPotAction: (i: unknown) => actions.createPotAction(i),
  updatePotAction: (i: unknown) => actions.updatePotAction(i),
  removePotAction: (i: unknown) => actions.removePotAction(i),
  saveBudgetPlanAction: (i: unknown) => actions.saveBudgetPlanAction(i),
  deleteBudgetPlanAction: (i: unknown) => actions.deleteBudgetPlanAction(i),
}))
const toast = { success: vi.fn<(m: string) => void>(), error: vi.fn<(m: string) => void>() }
vi.mock('sonner', () => ({
  toast: { success: (m: string) => toast.success(m), error: (m: string) => toast.error(m) },
}))

const targets = Object.fromEntries(DEFAULT_POTS.map((p) => [p.key, p.targetBps]))
const OLD: BudgetPlan = {
  id: '00000000-0000-4000-8000-00000000aa01',
  startsMonth: '2026-06',
  targets: { essential: 5000 },
}
const NEW: BudgetPlan = {
  id: '00000000-0000-4000-8000-00000000aa02',
  startsMonth: '2026-12',
  targets,
}

function renderBudget(plans: BudgetPlan[] = [OLD, NEW]) {
  return render(<BudgetView data={sampleData()} plans={plans} today="2026-12" />)
}

beforeEach(() => {
  for (const action of Object.values(actions)) action.mockResolvedValue({ ok: true })
})
afterEach(() => vi.clearAllMocks())

describe('BudgetView · potes', () => {
  it('edits the version in force and saves its targets', async () => {
    renderBudget()
    expect(screen.getByText('10% livre para distribuir')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Versão do orçamento' })).toHaveTextContent(
      'dez/26 em diante',
    )
    const save = screen.getByRole('button', { name: 'Salvar metas' })
    expect(save).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Conforto'), { target: { value: '12' } })
    expect(screen.getByText('5% livre para distribuir')).toBeInTheDocument()
    await userEvent.click(save)
    await waitFor(() => expect(actions.saveBudgetPlanAction).toHaveBeenCalledOnce())
    expect(actions.saveBudgetPlanAction.mock.calls[0]?.[0]).toEqual({
      id: NEW.id,
      startsMonth: '2026-12',
      targets: { ...targets, comfort: 1200 },
    })
    expect(toast.success).toHaveBeenCalledWith('Metas salvas.')
  })

  it('never lets a slider pass what the other pots leave', () => {
    renderBudget()
    fireEvent.change(screen.getByLabelText('Conforto'), { target: { value: '90' } })
    expect(screen.getByText('100% distribuído')).toBeInTheDocument()
  })

  it('creates a pot inline with the next free color', async () => {
    renderBudget()
    await userEvent.click(screen.getByRole('button', { name: 'Novo pote' }))
    await userEvent.type(screen.getByLabelText('Nome do novo pote'), 'Viagens{Enter}')
    await waitFor(() => expect(actions.createPotAction).toHaveBeenCalledOnce())
    expect(actions.createPotAction).toHaveBeenCalledWith({ name: 'Viagens', color: 'sky' })
  })

  it('renames a pot from its menu', async () => {
    renderBudget()
    await userEvent.click(screen.getByRole('button', { name: 'Ações do pote Conforto' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Renomear' }))
    const input = await screen.findByLabelText('Nome do pote')
    await userEvent.clear(input)
    await userEvent.type(input, 'Lazer{Enter}')
    await waitFor(() =>
      expect(actions.updatePotAction).toHaveBeenCalledWith({ key: 'comfort', name: 'Lazer' }),
    )
  })

  it('archives instead of deleting a pot with history, and says so', async () => {
    actions.removePotAction.mockResolvedValue({ ok: true, archived: true })
    renderBudget()
    await userEvent.click(screen.getByRole('button', { name: 'Ações do pote Essencial' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Excluir' }))
    await waitFor(() => expect(actions.removePotAction).toHaveBeenCalledWith('essential'))
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/arquivado/))
  })

  it('creates a new version from the month picked', async () => {
    renderBudget()
    await userEvent.click(screen.getByRole('button', { name: 'Versões do orçamento' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /Nova versão/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Nova versão do orçamento' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar versão' }))
    await waitFor(() => expect(actions.saveBudgetPlanAction).toHaveBeenCalledOnce())
    expect(actions.saveBudgetPlanAction.mock.calls[0]?.[0]).toMatchObject({
      id: null,
      startsMonth: '2027-01',
      targets,
    })
  })
})

describe('BudgetView · mais ações', () => {
  it('recolors a pot from its swatch', async () => {
    renderBudget()
    await userEvent.click(screen.getByRole('button', { name: 'Cor do pote Conforto' }))
    await userEvent.click(await screen.findByRole('radio', { name: 'Verde-água' }))
    await waitFor(() =>
      expect(actions.updatePotAction).toHaveBeenCalledWith({ key: 'comfort', color: 'teal' }),
    )
  })

  it('switches how a pot is measured', async () => {
    renderBudget()
    await userEvent.click(screen.getByRole('button', { name: 'Ações do pote Conforto' }))
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Meta mínima' }))
    await waitFor(() =>
      expect(actions.updatePotAction).toHaveBeenCalledWith({ key: 'comfort', goal: 'minimum' }),
    )
  })

  it('renames on double click and cancels with Escape', async () => {
    renderBudget()
    await userEvent.dblClick(screen.getByText('Livre', { selector: 'label' }))
    const input = screen.getByLabelText('Nome do pote')
    await userEvent.type(input, ' extra{Escape}')
    expect(screen.queryByLabelText('Nome do pote')).not.toBeInTheDocument()
    expect(actions.updatePotAction).not.toHaveBeenCalled()
  })

  it('deletes an unused pot, cancels a new one and reports errors', async () => {
    actions.removePotAction.mockResolvedValue({ ok: true, archived: false })
    renderBudget()
    await userEvent.click(screen.getByRole('button', { name: 'Ações do pote Educação' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Excluir' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('"Educação" excluído.'))

    await userEvent.click(screen.getByRole('button', { name: 'Novo pote' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByLabelText('Nome do novo pote')).not.toBeInTheDocument()

    actions.createPotAction.mockResolvedValue({ ok: false, error: 'Falhou.' })
    await userEvent.click(screen.getByRole('button', { name: 'Novo pote' }))
    await userEvent.type(screen.getByLabelText('Nome do novo pote'), 'X{Enter}')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Falhou.'))
  })

  it('lists archived pots apart and restores them', async () => {
    const data = sampleData()
    const pots = data.pots.map((p) => (p.key === 'education' ? { ...p, archived: true } : p))
    render(
      <BudgetView
        data={{ ...data, pots }}
        plans={[{ ...NEW, targets: { ...targets, education: 0 } }]}
        today="2026-12"
      />,
    )
    expect(screen.queryByLabelText('Educação')).not.toBeInTheDocument()
    await userEvent.click(screen.getByText('Arquivados (1)'))
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar' }))
    await waitFor(() =>
      expect(actions.updatePotAction).toHaveBeenCalledWith({ key: 'education', archived: false }),
    )
  })

  it('undoes unsaved changes', () => {
    renderBudget()
    fireEvent.change(screen.getByLabelText('Conforto'), { target: { value: '12' } })
    fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }))
    expect(screen.getByText('10% livre para distribuir')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar metas' })).toBeDisabled()
  })

  it('switches versions, asking first when there are unsaved changes', async () => {
    renderBudget()
    fireEvent.change(screen.getByLabelText('Conforto'), { target: { value: '12' } })
    await userEvent.click(screen.getByRole('combobox', { name: 'Versão do orçamento' }))
    await userEvent.click(await screen.findByRole('option', { name: 'jun/26 – nov/26' }))
    const confirm = await screen.findByRole('alertdialog', { name: 'Descartar as mudanças?' })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Descartar' }))
    expect(screen.getByText('Versão de jun/26 – nov/26')).toBeInTheDocument()
    expect(screen.getByText('50% livre para distribuir')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('combobox', { name: 'Versão do orçamento' }))
    await userEvent.click(await screen.findByRole('option', { name: 'dez/26 em diante' }))
    expect(screen.getByText('Versão em vigor de dez/26 em diante')).toBeInTheDocument()
  })

  it('moves the start of a version and deletes one after confirming', async () => {
    renderBudget()
    await userEvent.click(screen.getByRole('button', { name: 'Versões do orçamento' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /Mudar início/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Mudar início' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }))
    await waitFor(() =>
      expect(actions.saveBudgetPlanAction).toHaveBeenCalledWith({
        id: NEW.id,
        startsMonth: '2026-12',
        targets,
      }),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Versões do orçamento' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /Excluir versão/ }))
    const confirm = await screen.findByRole('alertdialog')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Excluir versão' }))
    await waitFor(() => expect(actions.deleteBudgetPlanAction).toHaveBeenCalledWith(NEW.id))
  })

  it('cancels the version dialog', async () => {
    renderBudget()
    await userEvent.click(screen.getByRole('button', { name: 'Versões do orçamento' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /Nova versão/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Nova versão do orçamento' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(actions.saveBudgetPlanAction).not.toHaveBeenCalled()
  })

  it('keeps the name when the rename is left empty, and the color when the same one is picked', async () => {
    renderBudget()
    await userEvent.dblClick(screen.getByText('Livre', { selector: 'label' }))
    await userEvent.clear(screen.getByLabelText('Nome do pote'))
    await userEvent.tab()
    expect(screen.getByText('Livre', { selector: 'label' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cor do pote Livre' }))
    await userEvent.click(await screen.findByRole('radio', { name: 'Rosa' }))
    expect(actions.updatePotAction).not.toHaveBeenCalled()
  })

  it('ignores an empty new pot and closes it with Escape', async () => {
    renderBudget()
    await userEvent.click(screen.getByRole('button', { name: 'Novo pote' }))
    const input = screen.getByLabelText('Nome do novo pote')
    await userEvent.type(input, '   {Enter}')
    expect(actions.createPotAction).not.toHaveBeenCalled()
    await userEvent.type(input, '{Escape}')
    expect(screen.queryByLabelText('Nome do novo pote')).not.toBeInTheDocument()
  })

  it('keeps an archived pot that still has a target, marked and restorable from its menu', async () => {
    const data = sampleData()
    const pots = data.pots.map((p) => (p.key === 'education' ? { ...p, archived: true } : p))
    render(<BudgetView data={{ ...data, pots }} plans={[NEW]} today="2026-12" />)
    expect(screen.getByText('(arquivado)', { selector: 'label span' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ações do pote Educação' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Restaurar' }))
    await waitFor(() =>
      expect(actions.updatePotAction).toHaveBeenCalledWith({ key: 'education', archived: false }),
    )
  })

  it('measures a minimum pot back as a spending limit', async () => {
    renderBudget()
    expect(screen.getByText(/^guardar ao menos R\$/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ações do pote Investimento' }))
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Limite de gasto' }))
    await waitFor(() =>
      expect(actions.updatePotAction).toHaveBeenCalledWith({ key: 'investment', goal: 'limit' }),
    )
  })

  it('renders nothing for the pots without any version', () => {
    renderBudget([])
    expect(screen.queryByRole('heading', { name: 'Potes da renda' })).not.toBeInTheDocument()
  })
})

describe('BudgetView · semáforo', () => {
  const header = () => screen.getByText(/–/, { selector: 'p[aria-live]' })

  it('shows 12 months up to two months ahead and walks them with the arrows', async () => {
    renderBudget()
    expect(header()).toHaveTextContent('mar/26 – fev/27')
    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
    expect(header()).toHaveTextContent('fev/26 – jan/27')
    await userEvent.click(screen.getByRole('button', { name: 'Próximo mês' }))
    await userEvent.click(screen.getByRole('button', { name: 'Próximo mês' }))
    expect(header()).toHaveTextContent('abr/26 – mar/27')
    await userEvent.click(screen.getByRole('button', { name: 'Hoje' }))
    expect(header()).toHaveTextContent('mar/26 – fev/27')
  })

  it('judges each month by its own version and leaves earlier months without a light', () => {
    renderBudget()
    expect(
      screen.getByLabelText(/^Essencial em mai\/26: .*Sem meta: mês antes da primeira versão/),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/^Essencial em nov\/26: .*meta 50%/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Essencial em dez\/26: .*meta 33%/)).toBeInTheDocument()
  })
})
