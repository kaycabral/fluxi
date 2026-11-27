import type { ActionResult } from '@/features/ledger/core/action-result'
import type { BudgetVersion } from '@/features/ledger/core/types'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BudgetView } from './budget-view'
import { sampleData } from './test-fixtures'

const writeBrowserCookie = vi.hoisted(() => vi.fn())
vi.mock('@/lib/browser-cookie', () => ({ writeBrowserCookie }))

const actions = {
  createBudgetGroupAction: vi.fn<(input: unknown) => Promise<ActionResult>>(),
  updateBudgetGroupAction: vi.fn<(input: unknown) => Promise<ActionResult>>(),
  removeBudgetGroupAction:
    vi.fn<(input: unknown) => Promise<ActionResult & { archived?: boolean }>>(),
  saveBudgetVersionAction: vi.fn<(input: unknown) => Promise<ActionResult>>(),
  deleteBudgetVersionAction: vi.fn<(input: unknown) => Promise<ActionResult>>(),
}
vi.mock('@/features/ledger/adapters/actions/budget', () => ({
  createBudgetGroupAction: (i: unknown) => actions.createBudgetGroupAction(i),
  updateBudgetGroupAction: (i: unknown) => actions.updateBudgetGroupAction(i),
  removeBudgetGroupAction: (i: unknown) => actions.removeBudgetGroupAction(i),
  saveBudgetVersionAction: (i: unknown) => actions.saveBudgetVersionAction(i),
  deleteBudgetVersionAction: (i: unknown) => actions.deleteBudgetVersionAction(i),
}))
const toast = { success: vi.fn<(m: string) => void>(), error: vi.fn<(m: string) => void>() }
vi.mock('sonner', () => ({
  toast: { success: (m: string) => toast.success(m), error: (m: string) => toast.error(m) },
}))

// 90% distributed (independent of the defaults, so the sliders have room).
const targets: Record<string, number> = {
  essential: 3300,
  comfort: 700,
  guilt_free: 700,
  education: 300,
  investment: 4000,
}
const OLD: BudgetVersion = {
  id: '00000000-0000-4000-8000-00000000aa01',
  startsMonth: '2026-06',
  targets: { essential: 5000 },
}
const NEW: BudgetVersion = {
  id: '00000000-0000-4000-8000-00000000aa02',
  startsMonth: '2026-12',
  targets,
}

function renderBudget(versions: BudgetVersion[] = [OLD, NEW]) {
  return render(<BudgetView data={sampleData()} versions={versions} today="2026-12" />)
}

beforeEach(() => {
  for (const action of Object.values(actions)) action.mockResolvedValue({ ok: true })
})
afterEach(() => vi.clearAllMocks())

describe('BudgetView · grupos', () => {
  it('measures each group in the month of the selected version', async () => {
    renderBudget([OLD, { ...NEW, startsMonth: '2027-01' }])
    expect(screen.getAllByText(/planejado em dez\/26/).length).toBeGreaterThan(0)
    await userEvent.click(screen.getByRole('combobox', { name: 'Versão do orçamento' }))
    await userEvent.click(await screen.findByRole('option', { name: 'jan/27 em diante' }))
    expect(screen.getAllByText(/planejado em jan\/27/).length).toBeGreaterThan(0)
  })

  it('measures in its first month a version that only starts after today', () => {
    renderBudget([{ ...NEW, startsMonth: '2027-01' }])
    expect(screen.getAllByText(/planejado em jan\/27/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/planejado em dez\/26/)).toBeNull()
  })

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
    await waitFor(() => expect(actions.saveBudgetVersionAction).toHaveBeenCalledOnce())
    expect(actions.saveBudgetVersionAction.mock.calls[0]?.[0]).toEqual({
      id: NEW.id,
      startsMonth: '2026-12',
      targets: { ...targets, comfort: 1200 },
    })
    expect(toast.success).toHaveBeenCalledWith('Metas salvas.')
  })

  it('never lets a slider pass what the other budget groups leave', () => {
    renderBudget()
    fireEvent.change(screen.getByLabelText('Conforto'), { target: { value: '90' } })
    expect(screen.getByText('100% distribuído')).toBeInTheDocument()
  })

  it('creates a budget group inline with the next free color', async () => {
    renderBudget()
    await userEvent.click(screen.getByRole('button', { name: 'Novo grupo' }))
    await userEvent.type(screen.getByLabelText('Nome do novo grupo'), 'Viagens{Enter}')
    await waitFor(() => expect(actions.createBudgetGroupAction).toHaveBeenCalledOnce())
    expect(actions.createBudgetGroupAction).toHaveBeenCalledWith({
      name: 'Viagens',
      color: 'yellow',
    })
  })

  it('renames a budget group from its menu', async () => {
    renderBudget()
    await userEvent.click(screen.getByRole('button', { name: 'Ações do grupo Conforto' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Renomear' }))
    const input = await screen.findByLabelText('Nome do grupo')
    await userEvent.clear(input)
    await userEvent.type(input, 'Lazer{Enter}')
    await waitFor(() =>
      expect(actions.updateBudgetGroupAction).toHaveBeenCalledWith({
        key: 'comfort',
        name: 'Lazer',
      }),
    )
  })

  it('archives instead of deleting a budget group with history, and says so', async () => {
    actions.removeBudgetGroupAction.mockResolvedValue({ ok: true, archived: true })
    renderBudget()
    await userEvent.click(screen.getByRole('button', { name: 'Ações do grupo Essencial' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Excluir' }))
    await waitFor(() => expect(actions.removeBudgetGroupAction).toHaveBeenCalledWith('essential'))
    expect(toast.success).toHaveBeenCalledWith(expect.stringMatching(/arquivado/))
  })

  it('creates a new version from the month picked', async () => {
    renderBudget()
    await userEvent.click(screen.getByRole('button', { name: 'Versões do orçamento' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /Nova versão/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Nova versão do orçamento' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Criar versão' }))
    await waitFor(() => expect(actions.saveBudgetVersionAction).toHaveBeenCalledOnce())
    expect(actions.saveBudgetVersionAction.mock.calls[0]?.[0]).toMatchObject({
      id: null,
      startsMonth: '2027-01',
      targets,
    })
  })
})

describe('BudgetView · mais ações', () => {
  it('recolors a budget group from its swatch', async () => {
    renderBudget()
    await userEvent.click(screen.getByRole('button', { name: 'Cor do grupo Conforto' }))
    await userEvent.click(await screen.findByRole('radio', { name: 'Verde-água' }))
    await waitFor(() =>
      expect(actions.updateBudgetGroupAction).toHaveBeenCalledWith({
        key: 'comfort',
        color: 'teal',
      }),
    )
  })

  it('switches how a budget group is measured', async () => {
    renderBudget()
    await userEvent.click(screen.getByRole('button', { name: 'Ações do grupo Conforto' }))
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Meta mínima' }))
    await waitFor(() =>
      expect(actions.updateBudgetGroupAction).toHaveBeenCalledWith({
        key: 'comfort',
        goal: 'minimum',
      }),
    )
  })

  it('renames on double click and cancels with Escape', async () => {
    renderBudget()
    await userEvent.dblClick(screen.getByText('Livre', { selector: 'label' }))
    const input = screen.getByLabelText('Nome do grupo')
    await userEvent.type(input, ' extra{Escape}')
    expect(screen.queryByLabelText('Nome do grupo')).not.toBeInTheDocument()
    expect(actions.updateBudgetGroupAction).not.toHaveBeenCalled()
  })

  it('deletes an unused budget group, cancels a new one and reports errors', async () => {
    actions.removeBudgetGroupAction.mockResolvedValue({ ok: true, archived: false })
    renderBudget()
    await userEvent.click(screen.getByRole('button', { name: 'Ações do grupo Educação' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Excluir' }))
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('"Educação" excluído.'))

    await userEvent.click(screen.getByRole('button', { name: 'Novo grupo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByLabelText('Nome do novo grupo')).not.toBeInTheDocument()

    actions.createBudgetGroupAction.mockResolvedValue({ ok: false, error: 'Falhou.' })
    await userEvent.click(screen.getByRole('button', { name: 'Novo grupo' }))
    await userEvent.type(screen.getByLabelText('Nome do novo grupo'), 'X{Enter}')
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Falhou.'))
  })

  it('lists archived budget groups apart and restores them', async () => {
    const data = sampleData()
    const budgetGroups = data.budgetGroups.map((p) =>
      p.key === 'education' ? { ...p, archived: true } : p,
    )
    render(
      <BudgetView
        data={{ ...data, budgetGroups }}
        versions={[{ ...NEW, targets: { ...targets, education: 0 } }]}
        today="2026-12"
      />,
    )
    expect(screen.queryByLabelText('Educação')).not.toBeInTheDocument()
    await userEvent.click(screen.getByText('Arquivados (1)'))
    await userEvent.click(screen.getByRole('button', { name: 'Restaurar' }))
    await waitFor(() =>
      expect(actions.updateBudgetGroupAction).toHaveBeenCalledWith({
        key: 'education',
        archived: false,
      }),
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
      expect(actions.saveBudgetVersionAction).toHaveBeenCalledWith({
        id: NEW.id,
        startsMonth: '2026-12',
        targets,
      }),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Versões do orçamento' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /Excluir versão/ }))
    const confirm = await screen.findByRole('alertdialog')
    await userEvent.click(within(confirm).getByRole('button', { name: 'Excluir versão' }))
    await waitFor(() => expect(actions.deleteBudgetVersionAction).toHaveBeenCalledWith(NEW.id))
  })

  it('cancels the version dialog', async () => {
    renderBudget()
    await userEvent.click(screen.getByRole('button', { name: 'Versões do orçamento' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /Nova versão/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Nova versão do orçamento' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(actions.saveBudgetVersionAction).not.toHaveBeenCalled()
  })

  it('keeps the name when the rename is left empty, and the color when the same one is picked', async () => {
    renderBudget()
    await userEvent.dblClick(screen.getByText('Livre', { selector: 'label' }))
    await userEvent.clear(screen.getByLabelText('Nome do grupo'))
    await userEvent.tab()
    expect(screen.getByText('Livre', { selector: 'label' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cor do grupo Livre' }))
    await userEvent.click(await screen.findByRole('radio', { name: 'Rosa' }))
    expect(actions.updateBudgetGroupAction).not.toHaveBeenCalled()
  })

  it('ignores an empty new budget group and closes it with Escape', async () => {
    renderBudget()
    await userEvent.click(screen.getByRole('button', { name: 'Novo grupo' }))
    const input = screen.getByLabelText('Nome do novo grupo')
    await userEvent.type(input, '   {Enter}')
    expect(actions.createBudgetGroupAction).not.toHaveBeenCalled()
    await userEvent.type(input, '{Escape}')
    expect(screen.queryByLabelText('Nome do novo grupo')).not.toBeInTheDocument()
  })

  it('keeps an archived budget group that still has a target, marked and restorable from its menu', async () => {
    const data = sampleData()
    const budgetGroups = data.budgetGroups.map((p) =>
      p.key === 'education' ? { ...p, archived: true } : p,
    )
    render(<BudgetView data={{ ...data, budgetGroups }} versions={[NEW]} today="2026-12" />)
    expect(screen.getByText('(arquivado)', { selector: 'label span' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ações do grupo Educação' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Restaurar' }))
    await waitFor(() =>
      expect(actions.updateBudgetGroupAction).toHaveBeenCalledWith({
        key: 'education',
        archived: false,
      }),
    )
  })

  it('measures a minimum budget group back as a spending limit', async () => {
    renderBudget()
    // Investimento and Metas are both `minimum` budget groups.
    expect(screen.getAllByText(/^guardar ao menos \d/)).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Ações do grupo Investimento' }))
    await userEvent.click(await screen.findByRole('menuitemradio', { name: 'Limite de gasto' }))
    await waitFor(() =>
      expect(actions.updateBudgetGroupAction).toHaveBeenCalledWith({
        key: 'investment',
        goal: 'limit',
      }),
    )
  })

  it('renders nothing for the budget groups without any version', () => {
    renderBudget([])
    expect(screen.queryByRole('heading', { name: 'Grupos do orçamento' })).not.toBeInTheDocument()
  })
})

describe('BudgetView · semáforo', () => {
  const months = () =>
    screen
      .getAllByRole('columnheader')
      .map((h) => h.textContent)
      .filter((t) => t !== 'Grupo')

  it('opens on the default window before measuring (previous, current, next 3) and walks it with the arrows', async () => {
    renderBudget()
    expect(months()).toEqual(['nov/26', 'dez/26', 'jan/27', 'fev/27', 'mar/27'])
    // Same compact presentation as the dashboard widget: no range label, no legend.
    expect(screen.queryByText(/ – /)).not.toBeInTheDocument()
    expect(screen.queryByText('Dentro da meta')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
    expect(months()[0]).toBe('out/26')
    await userEvent.click(screen.getByRole('button', { name: 'Próximo mês' }))
    await userEvent.click(screen.getByRole('button', { name: 'Próximo mês' }))
    expect(months()[0]).toBe('dez/26')
    await userEvent.click(screen.getByRole('button', { name: 'Hoje' }))
    expect(months()[0]).toBe('nov/26')
  })

  it('shows "–" with no light where a month has no income to measure against', () => {
    render(
      <BudgetView
        data={{ ...sampleData(), entries: sampleData().entries.filter((e) => e.kind !== 'income') }}
        versions={[OLD, NEW]}
        today="2026-12"
      />,
    )
    const cell = screen.getAllByRole('link', {
      name: /^Essencial em dez\/26: sem renda prevista, não dá para medir o grupo/,
    })[0]
    if (cell === undefined) throw new Error('no Essencial cell')
    expect(cell).toHaveTextContent('–')
  })

  it('opens Transações filtered by the cell: that budget group, every day of that month', () => {
    renderBudget()
    const cell = screen.getAllByRole('link', {
      name: /^Essencial em dez\/26: .* Ver transações\.$/,
    })[0]
    if (cell === undefined) throw new Error('no Essencial cell')
    expect(cell).toHaveAttribute('href', '/painel/transacoes')
    fireEvent.click(cell)
    expect(writeBrowserCookie).toHaveBeenCalledWith(
      'fluxi_lancamentos',
      JSON.stringify({ from: '2026-12-01', to: '2026-12-31', budgetGroup: 'essential' }),
      { path: '/painel/transacoes' },
    )
  })

  describe('once the card is measured', () => {
    function measureAs(width: number) {
      vi.stubGlobal(
        'ResizeObserver',
        class {
          private readonly callback: (entries: { contentRect: { width: number } }[]) => void
          constructor(callback: (entries: { contentRect: { width: number } }[]) => void) {
            this.callback = callback
          }
          observe() {
            this.callback([{ contentRect: { width } }])
          }
          disconnect() {}
        },
      )
    }
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('a tight card opens on the current month and the next one', async () => {
      measureAs(330)
      renderBudget()
      await waitFor(() => expect(months()).toEqual(['dez/26', 'jan/27']))
      await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
      expect(months()).toEqual(['nov/26', 'dez/26'])
      await userEvent.click(screen.getByRole('button', { name: 'Hoje' }))
      expect(months()[0]).toBe('dez/26')
    })

    it('keeps the default window when the observer reports no size', () => {
      vi.stubGlobal(
        'ResizeObserver',
        class {
          private readonly callback: (entries: unknown[]) => void
          constructor(callback: (entries: unknown[]) => void) {
            this.callback = callback
          }
          observe() {
            this.callback([])
          }
          disconnect() {}
        },
      )
      const { unmount } = renderBudget()
      expect(months()).toEqual(['nov/26', 'dez/26', 'jan/27', 'fev/27', 'mar/27'])
      unmount()
    })

    it('a wide card shows more future months, one month back', async () => {
      measureAs(1150)
      renderBudget()
      await waitFor(() => expect(months()).toHaveLength(10))
      expect(months()[0]).toBe('nov/26')
    })
  })

  it('judges each month by its own version and leaves earlier months without a light', async () => {
    renderBudget()
    expect(screen.getByLabelText(/^Essencial em nov\/26: .*meta 50%/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Essencial em dez\/26: .*meta 33%/)).toBeInTheDocument()
    for (let i = 0; i < 6; i++) {
      await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
    }
    expect(
      screen.getByLabelText(/^Essencial em mai\/26: .*Sem meta: mês antes da primeira versão/),
    ).toBeInTheDocument()
  })
})
