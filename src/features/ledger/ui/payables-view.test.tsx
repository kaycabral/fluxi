import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LedgerShell } from './ledger-shell'
import { PayablesView } from './payables-view'
import { IDS, sampleData, sampleDataWithBenefit, sampleRefs } from './test-fixtures'

type Result = { ok: true } | { ok: false; error: string }
const markPaidAction = vi.fn<(input: unknown) => Promise<Result>>()
const unmarkPaidAction = vi.fn<(input: unknown) => Promise<Result>>()
vi.mock('@/features/ledger/adapters/actions/undo', () => ({
  undoAction: vi.fn(),
  forgetUndoAction: vi.fn(),
}))
vi.mock('@/features/ledger/adapters/actions/payments', () => ({
  markPaidAction: (i: unknown) => markPaidAction(i),
  unmarkPaidAction: (i: unknown) => unmarkPaidAction(i),
}))
vi.mock('@/features/ledger/adapters/actions/entries', () => ({
  createEntryAction: vi.fn(),
  updateEntryAction: vi.fn(),
  deleteEntryAction: vi.fn(),
  changeDayAction: vi.fn(),
}))
const toastError = vi.fn<(m: string) => void>()
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: (m: string) => toastError(m) } }))

const WINDOW = { from: '2026-12', to: '2027-01' }

function renderPayables(data = sampleData()) {
  // refs.today is 2026-12-15.
  return render(
    <LedgerShell refs={sampleRefs()}>
      <PayablesView data={data} window={WINDOW} today="2026-12-15" />
    </LedgerShell>,
  )
}

function group(name: RegExp) {
  return screen.getByRole('table', { name })
}

beforeEach(() => {
  markPaidAction.mockResolvedValue({ ok: true })
  unmarkPaidAction.mockResolvedValue({ ok: true })
})
afterEach(() => vi.clearAllMocks())

describe('PayablesView', () => {
  it('groups the unpaid occurrences by urgency with totals per kind', () => {
    renderPayables()
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'Atrasadas (3)',
      'Próximos 7 dias (2)',
      'Resto do mês (1)',
      'Próximo mês (5)',
    ])
    const overdue = group(/Atrasadas/)
    expect(
      within(overdue)
        .getAllByRole('row')
        .map((r) => r.textContent?.slice(0, 8)),
    ).toEqual(['DataDesc', '03/12/26', '05/12/26', '06/12/26'])
    expect(within(overdue).getByText('03/12/26')).toHaveClass('text-destructive')
    // Avulso 7000 out, the rest of November's salary (60%) in, a transfer of 400.
    expect(
      screen.getByText('Saídas R$ 7.000,00 · Entradas R$ 3.000,00 · Transferências R$ 400,00'),
    ).toBeInTheDocument()
    expect(
      within(overdue).getByRole('button', { name: 'Recebido: Salário (Saldo)' }),
    ).toBeInTheDocument()
    expect(within(group(/Resto do mês/)).getByText('1/12')).toBeInTheDocument()
  })

  it('marks one paid today with one click', async () => {
    renderPayables()
    await userEvent.click(screen.getByRole('button', { name: 'Pago: Avulso' }))
    await waitFor(() =>
      expect(markPaidAction).toHaveBeenCalledWith({
        entryId: IDS.once,
        month: '2026-12',
        partId: null,
      }),
    )
  })

  it('marks one paid on another date and reports failures', async () => {
    markPaidAction.mockResolvedValueOnce({ ok: false, error: 'Falhou.' })
    renderPayables()
    await userEvent.click(within(group(/Próximos 7 dias/)).getByLabelText('Escolher a data: Luz'))
    const date = await screen.findByLabelText('Pago em')
    expect(date).toHaveValue('2026-12-15')
    fireEvent.change(date, { target: { value: '2026-12-14' } })
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await waitFor(() =>
      expect(markPaidAction).toHaveBeenCalledWith({
        entryId: IDS.power,
        month: '2026-12',
        partId: null,
        paidOn: '2026-12-14',
      }),
    )
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Falhou.'))
  })

  it('hides paid occurrences unless asked, then lets them be undone', async () => {
    renderPayables(
      sampleData({
        payments: [{ entryId: IDS.once, month: '2026-12', partId: null, paidOn: '2026-12-02' }],
      }),
    )
    expect(screen.getByRole('heading', { name: 'Atrasadas (2)' })).toBeInTheDocument()
    expect(screen.queryByText('Pagos neste mês')).not.toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('Mostrar também os pagos deste mês'))
    const paid = group(/Pagos neste mês/)
    expect(within(paid).getByText(/em 02\/12\/26/)).toBeInTheDocument()
    await userEvent.click(within(paid).getByRole('button', { name: 'Desfazer: Avulso' }))
    await waitFor(() =>
      expect(unmarkPaidAction).toHaveBeenCalledWith({
        entryId: IDS.once,
        month: '2026-12',
        partId: null,
      }),
    )
  })

  it('never offers to pay a bank entry', () => {
    const data = sampleData()
    renderPayables({
      ...data,
      entries: data.entries.map((e) => (e.id === IDS.once ? { ...e, fromBank: true } : e)),
    })
    expect(screen.queryByRole('button', { name: /Pago: Avulso/ })).toBeNull()
    expect(screen.getByText('Pago · banco')).toBeInTheDocument()
  })

  it('never lets a bank entry be unpaid: it shows where it came from', async () => {
    const data = sampleData({
      payments: [{ entryId: IDS.once, month: '2026-12', partId: null, paidOn: '2026-12-03' }],
    })
    renderPayables({
      ...data,
      entries: data.entries.map((e) => (e.id === IDS.once ? { ...e, fromBank: true } : e)),
    })
    await userEvent.click(screen.getByLabelText('Mostrar também os pagos deste mês'))
    const paid = group(/Pagos neste mês/)
    expect(within(paid).getByText('Pago · banco')).toBeInTheDocument()
    expect(within(paid).queryByRole('button', { name: 'Desfazer: Avulso' })).toBeNull()
  })

  it('lists benefit-account occurrences like any other', () => {
    renderPayables(sampleDataWithBenefit())
    expect(screen.getAllByText('Mercado VA').length).toBeGreaterThan(0)
    expect(screen.queryByLabelText('Incluir contas de benefício')).not.toBeInTheDocument()
  })

  it('opens an occurrence in the sheet', async () => {
    renderPayables()
    await userEvent.click(within(group(/Atrasadas/)).getByRole('button', { name: /^Avulso/ }))
    expect(await screen.findByRole('dialog', { name: 'Editar lançamento' })).toBeInTheDocument()
  })

  it('says when there is nothing to pay', () => {
    renderPayables(sampleData({ entries: [], parts: [] }))
    expect(screen.getByText('Nada a pagar por enquanto')).toBeInTheDocument()
  })
})
