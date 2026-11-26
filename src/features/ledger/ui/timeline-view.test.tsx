import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LedgerShell } from './ledger-shell'
import { IDS, sampleData, sampleDataWithBenefit, sampleRefs } from './test-fixtures'
import { TimelineView } from './timeline-view'

type Result = { ok: true } | { ok: false; error: string }
const changeDayAction = vi.fn<(input: unknown) => Promise<Result>>()
vi.mock('@/features/ledger/adapters/actions/undo', () => ({
  undoAction: vi.fn(),
  forgetUndoAction: vi.fn(),
}))
vi.mock('@/features/ledger/adapters/actions/entries', () => ({
  createEntryAction: vi.fn(),
  updateEntryAction: vi.fn(),
  deleteEntryAction: vi.fn(),
  changeDayAction: (i: unknown) => changeDayAction(i),
}))
const markPaidAction = vi.fn<(input: unknown) => Promise<Result>>()
const unmarkPaidAction = vi.fn<(input: unknown) => Promise<Result>>()
vi.mock('@/features/ledger/adapters/actions/payments', () => ({
  markPaidAction: (i: unknown) => markPaidAction(i),
  unmarkPaidAction: (i: unknown) => unmarkPaidAction(i),
}))
const toastError = vi.fn<(m: string) => void>()
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (m: string) => toastError(m) } }))

const WINDOW = { from: '2026-09', to: '2027-03' }

function renderTimeline(data = sampleData(), today = '2026-12') {
  return render(
    <LedgerShell refs={sampleRefs()}>
      <TimelineView data={data} window={WINDOW} today={today} />
    </LedgerShell>,
  )
}

function rowOf(label: string) {
  return screen.getByRole('row', { name: new RegExp(`^${label}`) })
}

beforeEach(() => {
  changeDayAction.mockResolvedValue({ ok: true })
  markPaidAction.mockResolvedValue({ ok: true })
  unmarkPaidAction.mockResolvedValue({ ok: true })
})
afterEach(() => vi.clearAllMocks())

describe('TimelineView', () => {
  it('shows totals and balances accumulated over every month', () => {
    renderTimeline()
    expect(screen.getByRole('heading', { name: 'Mês a mês' })).toBeInTheDocument()
    const balances = within(rowOf('Saldo total')).getAllByRole('cell')
    // dez/26: 1200 on Dec 1st + 5000 salary (rest of nov + advance) − 260 − 7000 − 2500 = −3560
    expect(balances[4]).toHaveTextContent('-3.560,00')
    expect(screen.getByText(/soma todos os lançamentos desde o primeiro/)).toBeInTheDocument()
  })

  it('expands a bank into its active accounts', async () => {
    renderTimeline()
    expect(screen.queryByText('Cartão')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar contas de BTG' }))
    expect(screen.getByText('Cartão')).toBeInTheDocument()
    expect(screen.queryByText('Antiga')).not.toBeInTheDocument()
  })

  it('opens the day by day of the selected month', async () => {
    renderTimeline()
    expect(screen.getByRole('heading', { name: 'dez/26 dia a dia' })).toBeInTheDocument()
    expect(screen.getByText(/menor saldo -R\$ 5\.800,00 no dia 3/)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('O saldo fica negativo no dia 3.')
    expect(screen.getByText('1/12')).toBeInTheDocument()
    expect(screen.getByText('transferência')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'out/26' }))
    expect(screen.getByRole('heading', { name: 'out/26 dia a dia' })).toBeInTheDocument()
  })

  it('counts benefit accounts in the totals, the banks and the day by day', () => {
    renderTimeline(sampleDataWithBenefit())
    const cells = (label: string) =>
      within(rowOf(label))
        .getAllByRole('cell')
        .map((c) => c.textContent)
    // dez/26: the benefit adds 300 + 800 − 200 = 900 to the total and 800 to the income.
    expect(cells('Saldo total')[4]).toBe('-2.660,00')
    expect(cells('Entradas')[4]).toBe('5.800,00')
    expect(screen.getByRole('button', { name: 'Mostrar contas de Flash' })).toBeInTheDocument()
    expect(screen.queryByRole('rowgroup', { name: 'Benefícios' })).not.toBeInTheDocument()
    expect(screen.getByText('Mercado VA')).toBeInTheDocument()
  })

  it('filters the day by day by account', async () => {
    renderTimeline()
    await userEvent.click(screen.getByLabelText('Conta'))
    await userEvent.click(await screen.findByRole('option', { name: 'Nubank · Conta Nu' }))
    expect(screen.getByText(/começa com R\$ 200,00/)).toBeInTheDocument()
    expect(screen.queryByText('Avulso')).not.toBeInTheDocument()
  })

  it('moves a one-off occurrence directly and asks the scope for a recurring one', async () => {
    renderTimeline()
    const once = screen.getByLabelText('Dia de Avulso')
    await userEvent.clear(once)
    await userEvent.type(once, '9{Enter}')
    await waitFor(() =>
      expect(changeDayAction).toHaveBeenCalledWith({
        entryId: IDS.once,
        month: '2026-12',
        day: 9,
        scope: null,
      }),
    )

    changeDayAction.mockResolvedValueOnce({ ok: false, error: 'Falhou.' })
    const power = screen.getByLabelText('Dia de Luz')
    await userEvent.clear(power)
    await userEvent.type(power, '40')
    await userEvent.tab()
    const scope = await screen.findByRole('dialog', { name: 'Aplicar a mudança em…' })
    expect(scope).toHaveTextContent('Luz em dez/26: dia 15 → 31')
    await userEvent.click(within(scope).getByRole('button', { name: 'Aplicar' }))
    await waitFor(() =>
      expect(changeDayAction).toHaveBeenLastCalledWith({
        entryId: IDS.power,
        month: '2026-12',
        day: 31,
        scope: 'future',
      }),
    )
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Falhou.'))
  })

  it('restores the day when the scope is cancelled', async () => {
    renderTimeline()
    const power = screen.getByLabelText('Dia de Luz')
    await userEvent.clear(power)
    await userEvent.type(power, '20')
    await userEvent.tab()
    const scope = await screen.findByRole('dialog', { name: 'Aplicar a mudança em…' })
    await userEvent.click(within(scope).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.getByLabelText('Dia de Luz')).toHaveValue(15))
    expect(changeDayAction).not.toHaveBeenCalled()
  })

  it('opens an occurrence in the sheet and a new entry for the month', async () => {
    renderTimeline()
    await userEvent.click(screen.getByText('Buffet'))
    expect(await screen.findByRole('dialog', { name: 'Editar lançamento' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'Lançamento' }))
    expect(await screen.findByLabelText('Data')).toHaveValue('15/12/2026')
  })

  it('opens an occurrence from the keyboard', async () => {
    renderTimeline()
    const row = screen.getByRole('row', { name: /Buffet/ })
    fireEvent.keyDown(row, { key: 'Tab' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.keyDown(row, { key: 'Enter' })
    expect(await screen.findByRole('dialog', { name: 'Editar lançamento' })).toBeInTheDocument()
  })

  it('asks for a bank and account first', () => {
    renderTimeline(sampleData({ accounts: [] }))
    expect(screen.getByText('Cadastre seu primeiro banco e conta')).toBeInTheDocument()
  })

  it('shows an empty month', () => {
    renderTimeline(sampleData({ entries: [], parts: [] }))
    expect(screen.getByText('Nenhum lançamento neste mês.')).toBeInTheDocument()
  })

  it('marks occurrences paid/received in the day by day and flags the overdue ones', async () => {
    // refs.today is 2026-12-15: Avulso (day 3) is overdue, Buffet (day 25) is not.
    renderTimeline()
    const once = screen.getByRole('row', { name: /Avulso/ })
    expect(within(once).getByText('Atrasada')).toBeInTheDocument()
    expect(within(screen.getByRole('row', { name: /Buffet/ })).queryByText('Atrasada')).toBeNull()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Pago: Avulso' }))
    await waitFor(() =>
      expect(markPaidAction).toHaveBeenCalledWith({
        entryId: IDS.once,
        month: '2026-12',
        partId: null,
      }),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // Keys on the checkbox stay there too: Enter never opens the row's editor.
    screen.getByRole('checkbox', { name: 'Pago: Avulso' }).focus()
    await userEvent.keyboard('{Enter}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('checkbox', { name: 'Recebido: Salário (Saldo)' }))
    await waitFor(() => expect(markPaidAction).toHaveBeenCalledTimes(2))
    expect(markPaidAction).toHaveBeenLastCalledWith({
      entryId: IDS.salary,
      month: '2026-11',
      partId: `${IDS.salary}-b`,
    })
  })

  it('shows paid occurrences checked and unmarks them', async () => {
    renderTimeline(
      sampleData({
        payments: [{ entryId: IDS.once, month: '2026-12', partId: null, paidOn: '2026-12-03' }],
      }),
    )
    const box = screen.getByRole('checkbox', { name: 'Pago: Avulso' })
    expect(box).toBeChecked()
    expect(within(screen.getByRole('row', { name: /Avulso/ })).queryByText('Atrasada')).toBeNull()
    unmarkPaidAction.mockResolvedValueOnce({ ok: false, error: 'Falhou.' })
    await userEvent.click(box)
    await waitFor(() =>
      expect(unmarkPaidAction).toHaveBeenCalledWith({
        entryId: IDS.once,
        month: '2026-12',
        partId: null,
      }),
    )
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Falhou.'))
  })
})
