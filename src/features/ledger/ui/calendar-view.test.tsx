import { saveCalendarPrefsAction } from '@/features/ledger/adapters/actions/calendar-prefs'
import {
  changeDayAction,
  createEntryAction,
  deleteEntryAction,
} from '@/features/ledger/adapters/actions/entries'
import { markPaidAction, unmarkPaidAction } from '@/features/ledger/adapters/actions/payments'
import { DEFAULT_CALENDAR_PREFS, type CalendarPrefs } from '@/features/ledger/core/calendar-prefs'
import type { CalendarViewMode } from '@/features/ledger/core/calendar-views'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CalendarView } from './calendar-view'
import { useCalendar } from './calendar/context'
import { chipCapacity } from './calendar/month-grid'
import { LedgerShell } from './ledger-shell'
import { IDS, sampleData, sampleRefs } from './test-fixtures'

const replace = vi.fn<(href: string, options?: unknown) => void>()
const push = vi.fn<(href: string, options?: unknown) => void>()
vi.mock('@/features/ledger/adapters/actions/categorize', () => ({
  findSimilarAction: vi.fn(() =>
    Promise.resolve({ ok: true, data: { reference: null, candidates: [] } }),
  ),
  categorizeEntriesAction: vi.fn(() => Promise.resolve({ ok: true })),
  loadRulesAction: vi.fn(() => Promise.resolve({ ok: true, data: [] })),
  deleteRuleAction: vi.fn(() => Promise.resolve({ ok: true })),
}))
vi.mock('@/features/ledger/adapters/actions/undo', () => ({
  undoAction: vi.fn(),
  forgetUndoAction: vi.fn(),
}))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push, refresh: vi.fn() }),
}))
vi.mock('@/features/ledger/adapters/actions/entries', () => ({
  createEntryAction: vi.fn(),
  updateEntryAction: vi.fn(),
  deleteEntryAction: vi.fn(),
  changeDayAction: vi.fn(),
}))
vi.mock('@/features/ledger/adapters/actions/payments', () => ({
  markPaidAction: vi.fn(),
  unmarkPaidAction: vi.fn(),
}))
vi.mock('@/features/ledger/adapters/actions/calendar-prefs', () => ({
  saveCalendarPrefsAction: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

type Options = {
  view?: CalendarViewMode
  date?: string
  account?: string
  data?: ReturnType<typeof sampleData>
  prefs?: Partial<CalendarPrefs>
}

function renderCalendar({
  view = 'month',
  date = '2026-12-15',
  account = '',
  data = sampleData(),
  prefs = {},
}: Options = {}) {
  return render(
    <LedgerShell refs={sampleRefs()}>
      <CalendarView
        data={data}
        view={view}
        date={date}
        account={account}
        today="2026-12-15"
        prefs={{ ...DEFAULT_CALENDAR_PREFS, view, ...prefs }}
      />
    </LedgerShell>,
  )
}

/** A day of the month grid or of the column views, by its number in December 2026. */
const dayGroup = (day: number) =>
  screen.getByRole('group', { name: new RegExp(`, ${day} de dezembro(,|$)`) })

/** The button under a day's entries: a click on any empty spot of the day. */
const emptyPartOf = (day: number) =>
  within(dayGroup(day)).getByRole('button', { name: /^Criar transação em/ })

beforeEach(() => {
  vi.mocked(createEntryAction).mockResolvedValue({ ok: true })
  vi.mocked(deleteEntryAction).mockResolvedValue({ ok: true })
  vi.mocked(changeDayAction).mockResolvedValue({ ok: true })
  vi.mocked(markPaidAction).mockResolvedValue({ ok: true })
  vi.mocked(unmarkPaidAction).mockResolvedValue({ ok: true })
  vi.mocked(saveCalendarPrefsAction).mockResolvedValue(null)
})
afterEach(() => vi.clearAllMocks())

describe('chipCapacity', () => {
  it('fits the chips under the day header, at least one line; everything until measured', () => {
    expect(chipCapacity(null)).toBe(Number.POSITIVE_INFINITY)
    expect(chipCapacity(0)).toBe(Number.POSITIVE_INFINITY)
    expect(chipCapacity(140)).toBe(5)
    expect(chipCapacity(20)).toBe(1)
  })
})

describe('useCalendar', () => {
  it('needs the calendar', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    function Orphan() {
      useCalendar()
      return null
    }
    expect(() => render(<Orphan />)).toThrow('useCalendar must be used inside <CalendarView>')
  })
})

describe('CalendarView · month', () => {
  it('shows the full weeks, entries per day and the negative days', () => {
    renderCalendar()
    expect(screen.getByRole('heading', { level: 1, name: 'Dezembro de 2026' })).toBeInTheDocument()
    expect(
      within(dayGroup(3)).getByRole('button', { name: /7\.000,00 Avulso/ }),
    ).toBeInTheDocument()
    // Day 3 ends at 1200 − 7000 = −5.800,00.
    expect(dayGroup(3)).toHaveAccessibleName(/saldo negativo/)
    expect(within(dayGroup(3)).getByText('-5.800,00')).toBeInTheDocument()
    // Neighbour days fill the first and last weeks; the 1st shows its month.
    expect(
      screen.getByRole('button', { name: /^Criar transação em segunda-feira, 30 de novembro/ }),
    ).toBeInTheDocument()
    expect(screen.getByText('1 dez.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /terça-feira, 15 de dezembro/ })).toHaveAttribute(
      'aria-current',
      'date',
    )
  })

  it('creates an entry from beside the title', async () => {
    renderCalendar()
    await userEvent.click(screen.getByRole('button', { name: 'Nova transação' }))
    expect(await screen.findByRole('dialog', { name: 'Nova transação' })).toBeInTheDocument()
  })

  it('links today and the previous/next month, keeping the account', () => {
    renderCalendar({ account: IDS.nucc })
    expect(screen.getByRole('link', { name: 'Hoje' })).toHaveAttribute(
      'href',
      `/painel/calendario?modo=mes&conta=${IDS.nucc}`,
    )
    expect(screen.getByRole('link', { name: 'Próximo' })).toHaveAttribute(
      'href',
      `/painel/calendario?modo=mes&data=2027-01-01&conta=${IDS.nucc}`,
    )
    expect(screen.getByRole('link', { name: 'Anterior' })).toHaveAttribute(
      'href',
      `/painel/calendario?modo=mes&data=2026-11-01&conta=${IDS.nucc}`,
    )
  })

  it('moves one month per wheel gesture', () => {
    renderCalendar()
    // The wheel bubbles from any day up to the grid.
    const body = dayGroup(10)
    fireEvent.wheel(body, { deltaY: 10 })
    expect(push).not.toHaveBeenCalled()
    fireEvent.wheel(body, { deltaY: 60 })
    expect(push).toHaveBeenLastCalledWith('/painel/calendario?modo=mes&data=2027-01-01', {
      scroll: false,
    })
    fireEvent.wheel(body, { deltaY: -200 })
    expect(push).toHaveBeenCalledOnce()
  })

  it('keeps the month when the wheel is inside a popup or its select list', async () => {
    renderCalendar()
    await userEvent.click(emptyPartOf(10))
    const form = await screen.findByRole('form', { name: 'Criar transação' })
    fireEvent.wheel(form, { deltaY: 200 })
    await userEvent.click(within(form).getByLabelText('Conta'))
    fireEvent.wheel(await screen.findByRole('listbox'), { deltaY: 200 })
    expect(push).not.toHaveBeenCalled()
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('shows "Mais N" when the entries do not fit, with the whole day in a card', async () => {
    const base = sampleData()
    const extra = base.entries.map((entry) =>
      entry.id === IDS.once ? { ...entry, id: 'x1', description: 'Extra', day: 15 } : entry,
    )
    const height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(150)
    renderCalendar({
      data: { ...base, entries: [...base.entries, ...extra.filter((e) => e.id === 'x1')] },
    })
    height.mockRestore()
    // 150px / 5 rows → 30px a day: one line, so the 15th (Luz + Extra) shows "Mais 2".
    await userEvent.click(within(dayGroup(15)).getByRole('button', { name: /^Mais \d$/ }))
    const card = await screen.findByLabelText('Transações de 2026-12-15')
    expect(within(card).getByRole('button', { name: /Luz/ })).toBeInTheDocument()
    await userEvent.click(within(card).getByRole('button', { name: 'Criar neste dia' }))
    expect(await screen.findByRole('form', { name: 'Criar transação' })).toHaveTextContent(
      'terça-feira, 15 de dezembro',
    )
  })
})

describe('CalendarView · event popup', () => {
  it('shows the details of an occurrence and edits it in the sheet', async () => {
    renderCalendar()
    await userEvent.click(screen.getByRole('button', { name: /Luz/ }))
    const details = await screen.findByLabelText('Detalhes de Luz')
    expect(details).toHaveTextContent('terça-feira, 15 de dezembro · Todo mês')
    expect(details).toHaveTextContent('-R$ 260,00')
    expect(details).toHaveTextContent('BTG · Conta')
    expect(details).toHaveTextContent('Energia elétrica · grupo Essencial')
    expect(details).toHaveTextContent('A pagar')
    expect(details).toHaveTextContent('#casa')
    await userEvent.click(within(details).getByRole('button', { name: 'Editar transação' }))
    expect(await screen.findByRole('dialog', { name: 'Editar transação' })).toBeInTheDocument()
  })

  it('says what is still to be received', async () => {
    renderCalendar({ date: '2027-01-10' })
    const january = screen
      .getAllByRole('group', { name: / de janeiro/ })
      .flatMap((day) => within(day).queryAllByRole('button', { name: /Salário/ }))
    await userEvent.click(january[0] ?? document.body)
    const details = await screen.findByLabelText(/^Detalhes de Salário/)
    expect(details).toHaveTextContent('A receber')
    expect(details).toHaveTextContent(/\+R\$ /)
  })

  it('marks an occurrence paid and unmarks a paid one', async () => {
    renderCalendar({
      data: sampleData({
        payments: [{ entryId: IDS.transfer, month: '2026-12', partId: null, paidOn: '2026-12-06' }],
      }),
    })
    await userEvent.click(screen.getByRole('button', { name: /Avulso/ }))
    const avulso = await screen.findByLabelText('Detalhes de Avulso')
    expect(avulso).toHaveTextContent('Atrasada')
    await userEvent.click(within(avulso).getByRole('button', { name: 'Marcar como pago' }))
    await waitFor(() =>
      expect(markPaidAction).toHaveBeenCalledWith({
        entryId: IDS.once,
        month: '2026-12',
        partId: null,
      }),
    )
    await userEvent.click(within(avulso).getByRole('button', { name: 'Fechar' }))

    const transfer = screen.getByRole('button', { name: /Para o Nubank/ })
    expect(transfer).toHaveClass('opacity-50')
    await userEvent.click(transfer)
    const paid = await screen.findByLabelText('Detalhes de Para o Nubank')
    expect(paid).toHaveTextContent('Pago em domingo, 6 de dezembro')
    expect(paid).toHaveTextContent('BTG · Conta → Nubank · Conta Nu')
    await userEvent.click(within(paid).getByRole('button', { name: 'Desmarcar pago' }))
    await waitFor(() => expect(unmarkPaidAction).toHaveBeenCalledOnce())
  })

  it('keeps a bank entry paid, undeletable and in place', async () => {
    const data = sampleData({
      payments: [{ entryId: IDS.once, month: '2026-12', partId: null, paidOn: '2026-12-03' }],
    })
    renderCalendar({
      data: {
        ...data,
        entries: data.entries.map((e) =>
          e.id === IDS.once ? { ...e, fromBank: true, merchantName: 'Padaria Veneza' } : e,
        ),
      },
      prefs: { paid: true },
    })
    const chip = screen.getByRole('button', { name: /Avulso/ })
    expect(chip).not.toHaveAttribute('draggable', 'true')
    expect(within(chip).getByRole('img', { name: 'Vem do banco' })).toBeInTheDocument()
    expect(chip).toHaveAttribute('title', expect.stringContaining('· Vem do banco'))
    await userEvent.click(chip)
    const popup = await screen.findByLabelText('Detalhes de Avulso')
    expect(popup).toHaveTextContent('(vem do banco)')
    expect(chip).toHaveAttribute('title', expect.stringContaining('Avulso · Padaria Veneza'))
    expect(popup).toHaveTextContent('Padaria Veneza')
    expect(within(popup).getByRole('img', { name: 'Vem do banco' })).toBeInTheDocument()
    expect(within(popup).queryByRole('button', { name: 'Excluir transação' })).toBeNull()
    expect(within(popup).queryByRole('button', { name: /pago/ })).toBeNull()
  })

  it('reports a refused payment', async () => {
    vi.mocked(markPaidAction).mockResolvedValue({ ok: false, error: 'Não deu.' })
    renderCalendar()
    await userEvent.click(screen.getByRole('button', { name: /Avulso/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar como pago' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Não deu.'))
  })

  it('deletes a one-off entry right away and asks the scope of a recurring one', async () => {
    renderCalendar()
    await userEvent.click(screen.getByRole('button', { name: /Avulso/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir transação' }))
    await waitFor(() =>
      expect(deleteEntryAction).toHaveBeenCalledWith({
        entryId: IDS.once,
        month: null,
        scope: 'all',
      }),
    )
    expect(toast.success).toHaveBeenCalledWith('Transação excluída.')

    await userEvent.click(screen.getByRole('button', { name: /Luz/ }))
    await userEvent.click(
      within(await screen.findByLabelText('Detalhes de Luz')).getByRole('button', {
        name: 'Excluir transação',
      }),
    )
    const dialog = await screen.findByRole('dialog', { name: /Excluir/ })
    await userEvent.click(within(dialog).getByLabelText(/Só este mês/))
    await userEvent.click(within(dialog).getByRole('button', { name: /Excluir/ }))
    await waitFor(() =>
      expect(deleteEntryAction).toHaveBeenLastCalledWith({
        entryId: IDS.power,
        month: '2026-12',
        scope: 'one',
      }),
    )
  })

  it('keeps the popup open with a refused delete, and does nothing when the scope is cancelled', async () => {
    vi.mocked(deleteEntryAction).mockResolvedValue({ ok: false, error: 'Não encontrado.' })
    renderCalendar()
    await userEvent.click(screen.getByRole('button', { name: /Avulso/ }))
    await userEvent.click(await screen.findByRole('button', { name: 'Excluir transação' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Não encontrado.'))
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }))

    await userEvent.click(screen.getByRole('button', { name: /Luz/ }))
    await userEvent.click(
      within(await screen.findByLabelText('Detalhes de Luz')).getByRole('button', {
        name: 'Excluir transação',
      }),
    )
    const dialog = await screen.findByRole('dialog', { name: /Excluir/ })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(deleteEntryAction).toHaveBeenCalledOnce()
  })
})

describe('CalendarView · quick add', () => {
  it('opens in a column view from a click or from the keyboard', async () => {
    renderCalendar({ view: 'day', date: '2026-12-10' })
    await userEvent.click(emptyPartOf(10))
    expect(await screen.findByRole('form', { name: 'Criar transação' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('form', { name: 'Criar transação' })).not.toBeInTheDocument(),
    )
    emptyPartOf(10).focus()
    await userEvent.keyboard('{Enter}')
    expect(await screen.findByRole('form', { name: 'Criar transação' })).toBeInTheDocument()
  })

  it('opens on a click in an empty part of a day and creates an entry there', async () => {
    renderCalendar()
    await userEvent.click(emptyPartOf(10))
    const form = await screen.findByRole('form', { name: 'Criar transação' })
    expect(form).toHaveTextContent('quinta-feira, 10 de dezembro')
    expect(within(form).getByLabelText('Descrição')).toHaveFocus()
    // The day shows a placeholder while the quick add is open.
    expect(within(dayGroup(10)).getByText('(Sem descrição)')).toBeInTheDocument()
    await userEvent.type(within(form).getByLabelText('Descrição'), 'Padaria')
    await userEvent.click(within(form).getByLabelText('Repetição'))
    await userEvent.click(await screen.findByRole('option', { name: 'Mensal no dia 10' }))
    await userEvent.type(within(form).getByLabelText('Valor'), '42,90{Enter}')
    await waitFor(() => expect(createEntryAction).toHaveBeenCalledOnce())
    expect(vi.mocked(createEntryAction).mock.calls[0]?.[0]).toMatchObject({
      fields: {
        kind: 'expense',
        amountCents: -4290,
        description: 'Padaria',
        accountId: IDS.cc,
        startMonth: '2026-12',
        day: 10,
        recurrence: 'monthly',
        budgetGroup: 'essential',
      },
    })
    await waitFor(() =>
      expect(screen.queryByRole('form', { name: 'Criar transação' })).not.toBeInTheDocument(),
    )
  })

  it('shows what is missing and the error the server returns', async () => {
    vi.mocked(createEntryAction).mockResolvedValue({ ok: false, error: 'Conta não encontrada.' })
    renderCalendar()
    await userEvent.click(emptyPartOf(10))
    const form = await screen.findByRole('form', { name: 'Criar transação' })
    await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }))
    expect(within(form).getByRole('alert')).toHaveTextContent('Informe o valor.')
    await userEvent.type(within(form).getByLabelText('Valor'), '10')
    await userEvent.type(within(form).getByLabelText('Descrição'), 'Café{Enter}')
    expect(await within(form).findByRole('alert')).toHaveTextContent('Conta não encontrada.')
    await userEvent.click(within(form).getByRole('button', { name: 'Fechar' }))
    await waitFor(() =>
      expect(screen.queryByRole('form', { name: 'Criar transação' })).not.toBeInTheDocument(),
    )
  })

  it('"Mais opções" carries what was typed to the full sheet', async () => {
    renderCalendar()
    await userEvent.click(emptyPartOf(10))
    const form = await screen.findByRole('form', { name: 'Criar transação' })
    await userEvent.click(within(form).getByRole('button', { name: 'Entrada' }))
    await userEvent.type(within(form).getByLabelText('Valor'), '10000')
    await userEvent.click(within(form).getByRole('button', { name: 'Mais opções' }))
    const sheet = await screen.findByRole('dialog', { name: 'Nova transação' })
    expect(within(sheet).getByLabelText('Data')).toHaveValue('10/12/2026')
    expect(within(sheet).getByLabelText('Valor')).toHaveValue('100,00')
    expect(within(sheet).getByRole('button', { name: 'Entrada' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})

describe('CalendarView · drag to another day', () => {
  const transfer = () => ({ setData: vi.fn(), effectAllowed: '', dropEffect: '' })
  function drag(chip: HTMLElement, day: number) {
    const target = dayGroup(day)
    const dataTransfer = transfer()
    fireEvent.dragStart(chip, { dataTransfer })
    fireEvent.dragOver(target, { dataTransfer })
    fireEvent.drop(target, { dataTransfer })
    return target
  }

  it('moves a one-off entry right away, showing it there until the server answers', async () => {
    vi.mocked(changeDayAction).mockReturnValue(new Promise(() => undefined))
    renderCalendar()
    const target = drag(screen.getByRole('button', { name: /Avulso/ }), 10)
    await waitFor(() =>
      expect(changeDayAction).toHaveBeenCalledWith({
        entryId: IDS.once,
        month: '2026-12',
        day: 10,
        scope: null,
      }),
    )
    expect(within(target).getByRole('button', { name: /Avulso/ })).toBeInTheDocument()
  })

  it('asks the scope of a recurring entry and reports a refused move', async () => {
    vi.mocked(changeDayAction).mockResolvedValue({ ok: false, error: 'Não deu.' })
    renderCalendar()
    drag(screen.getByRole('button', { name: /Luz/ }), 20)
    const dialog = await screen.findByRole('dialog', { name: 'Aplicar a mudança em…' })
    expect(dialog).toHaveTextContent('Luz em dez/26: dia 15 → 20')
    await userEvent.click(within(dialog).getByLabelText(/Só este mês/))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Aplicar' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Não deu.'))
  })

  it('ignores drops on the same day, on another month and cancelled scopes', async () => {
    renderCalendar()
    drag(screen.getByRole('button', { name: /Avulso/ }), 3)
    const chip = screen.getByRole('button', { name: /Avulso/ })
    fireEvent.dragStart(chip, { dataTransfer: transfer() })
    const november = screen.getByRole('group', { name: /30 de novembro/ })
    fireEvent.dragOver(november, { dataTransfer: transfer() })
    fireEvent.drop(november, { dataTransfer: transfer() })
    fireEvent.dragEnd(chip)
    drag(screen.getByRole('button', { name: /Luz/ }), 20)
    const dialog = await screen.findByRole('dialog', { name: 'Aplicar a mudança em…' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    expect(changeDayAction).not.toHaveBeenCalled()
  })
})

describe('CalendarView · views and preferences', () => {
  it('switches the view from the menu and remembers it', async () => {
    renderCalendar()
    await userEvent.click(screen.getByRole('button', { name: 'Visualização: Mês' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: /Semana/ }))
    expect(push).toHaveBeenCalledWith('/painel/calendario?modo=semana&data=2026-12-15', {
      scroll: false,
    })
    await waitFor(() =>
      expect(saveCalendarPrefsAction).toHaveBeenCalledWith({
        ...DEFAULT_CALENDAR_PREFS,
        view: 'week',
      }),
    )
  })

  it('hides weekends, paid entries and shows the ignored ones', async () => {
    renderCalendar({
      data: sampleData({
        payments: [{ entryId: IDS.transfer, month: '2026-12', partId: null, paidOn: '2026-12-06' }],
        overrides: [
          {
            entryId: IDS.power,
            month: '2026-12',
            amountCents: null,
            day: null,
            skipped: true,
            deleted: false,
          },
          // Deleted by the user: gone, even with "Mostrar ignorados".
          {
            entryId: IDS.buffet,
            month: '2026-12',
            amountCents: null,
            day: null,
            skipped: true,
            deleted: true,
          },
        ],
      }),
    })
    expect(screen.getByText('DOM.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Luz/ })).not.toBeInTheDocument()
    const menu = () => userEvent.click(screen.getByRole('button', { name: 'Visualização: Mês' }))

    await menu()
    await userEvent.click(
      await screen.findByRole('menuitemcheckbox', { name: 'Mostrar fins de semana' }),
    )
    expect(screen.queryByText('DOM.')).not.toBeInTheDocument()

    await menu()
    await userEvent.click(
      await screen.findByRole('menuitemcheckbox', { name: 'Mostrar pagos e recebidos' }),
    )
    expect(screen.queryByRole('button', { name: /Para o Nubank/ })).not.toBeInTheDocument()

    await menu()
    await userEvent.click(
      await screen.findByRole('menuitemcheckbox', { name: 'Mostrar ignorados' }),
    )
    const ignored = screen.getByRole('button', { name: /Luz/ })
    expect(ignored).toHaveClass('line-through')
    expect(screen.queryByRole('button', { name: /Buffet/ })).not.toBeInTheDocument()
    await userEvent.click(ignored)
    const details = await screen.findByLabelText('Detalhes de Luz')
    expect(details).toHaveTextContent('Ignorado neste mês')
    expect(
      within(details).queryByRole('button', { name: 'Marcar como pago' }),
    ).not.toBeInTheDocument()
    await waitFor(() =>
      expect(saveCalendarPrefsAction).toHaveBeenLastCalledWith({
        view: 'month',
        weekends: false,
        paid: false,
        skipped: true,
      }),
    )
  })

  it("answers Google Calendar's shortcuts, not while typing", () => {
    renderCalendar()
    fireEvent.keyDown(window, { key: 'w' })
    expect(push).toHaveBeenLastCalledWith('/painel/calendario?modo=semana&data=2026-12-15', {
      scroll: false,
    })
    fireEvent.keyDown(window, { key: 't' })
    expect(push).toHaveBeenLastCalledWith('/painel/calendario?modo=mes', { scroll: false })
    fireEvent.keyDown(window, { key: 'j' })
    expect(push).toHaveBeenLastCalledWith('/painel/calendario?modo=mes&data=2027-01-01', {
      scroll: false,
    })
    fireEvent.keyDown(window, { key: 'k' })
    expect(push).toHaveBeenLastCalledWith('/painel/calendario?modo=mes&data=2026-11-01', {
      scroll: false,
    })
    fireEvent.keyDown(window, { key: 'q' })
    fireEvent.keyDown(window, { key: 'm', ctrlKey: true })
    const input = document.createElement('input')
    document.body.append(input)
    fireEvent.keyDown(input, { key: 'd' })
    input.remove()
    expect(push).toHaveBeenCalledTimes(4)
  })

  it('lays out the week as day columns, with the quick add on each', async () => {
    renderCalendar({ view: 'week', date: '2026-12-15', prefs: { weekends: false } })
    expect(screen.getByRole('heading', { level: 1, name: 'Dezembro de 2026' })).toBeInTheDocument()
    expect(screen.queryByText('DOM.')).not.toBeInTheDocument()
    expect(within(dayGroup(15)).getByRole('button', { name: /Luz/ })).toBeInTheDocument()
    expect(screen.getByText('15')).toHaveAttribute('aria-current', 'date')
    await userEvent.click(emptyPartOf(16))
    expect(await screen.findByRole('form', { name: 'Criar transação' })).toHaveTextContent(
      'quarta-feira, 16 de dezembro',
    )
  })

  it('shows one day or four, and drags between their columns', async () => {
    const { unmount } = renderCalendar({ view: 'day', date: '2026-12-03' })
    expect(
      screen.getByRole('heading', { level: 1, name: '3 de dezembro de 2026' }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('group')).toHaveLength(1)
    unmount()
    renderCalendar({ view: 'four_days', date: '2026-12-03' })
    expect(screen.getAllByRole('group')).toHaveLength(4)
    const chip = screen.getByRole('button', { name: /Avulso/ })
    fireEvent.dragStart(chip, { dataTransfer: { setData: vi.fn() } })
    fireEvent.dragOver(dayGroup(5), { dataTransfer: {} })
    fireEvent.dragLeave(dayGroup(5))
    fireEvent.drop(dayGroup(5), { dataTransfer: {} })
    await waitFor(() =>
      expect(changeDayAction).toHaveBeenCalledWith(
        expect.objectContaining({ entryId: IDS.once, day: 5 }),
      ),
    )
  })

  it('shows the year as mini months; a day opens its list and creates in the sheet', async () => {
    renderCalendar({ view: 'year' })
    expect(screen.getByRole('heading', { level: 1, name: '2026' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(12)
    const december = screen.getByRole('region', { name: 'Dezembro' })
    await userEvent.click(
      within(december).getByRole('button', { name: 'quinta-feira, 3 de dezembro' }),
    )
    const card = await screen.findByLabelText('Transações de 2026-12-03')
    expect(card).toHaveTextContent('Saldo no fim do dia: -5.800,00')
    await userEvent.click(within(card).getByRole('button', { name: 'Criar neste dia' }))
    const sheet = await screen.findByRole('dialog', { name: 'Nova transação' })
    expect(within(sheet).getByLabelText('Data')).toHaveValue('03/12/2026')
  })

  it("shows each month's end balance next to its name in the year", () => {
    renderCalendar({ view: 'year' })
    const december = screen.getByRole('region', { name: 'Dezembro' })
    const balance = within(december).getByLabelText('Saldo no fim de Dezembro')
    expect(balance).toHaveTextContent('-3.560,00')
    expect(balance).toHaveClass('text-destructive')
    // Every month has a balance: it accumulates from the opening balances.
    expect(
      within(screen.getByRole('region', { name: 'Janeiro' })).getByLabelText(
        'Saldo no fim de Janeiro',
      ),
    ).toHaveTextContent('-20,00')
  })

  it('focuses the date in the year and brings today back with Hoje or T, like Google Calendar', async () => {
    renderCalendar({ view: 'year', date: '2026-03-10' })
    const march = screen.getByRole('region', { name: 'Março' })
    expect(within(march).getByRole('button', { name: 'terça-feira, 10 de março' })).toHaveFocus()

    const today = within(screen.getByRole('region', { name: 'Dezembro' })).getByRole('button', {
      name: 'terça-feira, 15 de dezembro',
    })
    await userEvent.click(screen.getByRole('link', { name: 'Hoje' }))
    expect(today).toHaveFocus()

    await userEvent.click(screen.getByRole('heading', { level: 1 }))
    expect(today).not.toHaveFocus()
    await userEvent.keyboard('t')
    expect(today).toHaveFocus()
  })

  it('leaves the focus alone when Hoje is pressed on another year', async () => {
    renderCalendar({ view: 'year', date: '2025-03-10' })
    const hoje = screen.getByRole('link', { name: 'Hoje' })
    await userEvent.click(hoje)
    // Today isn't on this page, so nothing takes the focus from the link.
    expect(hoje).toHaveFocus()
  })

  it('says when a day of the year has nothing', async () => {
    renderCalendar({ view: 'year' })
    const july = screen.getByRole('region', { name: 'Julho' })
    await userEvent.click(within(july).getByRole('button', { name: 'quarta-feira, 1 de julho' }))
    expect(await screen.findByText('Nada neste dia.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByText('Nada neste dia.')).not.toBeInTheDocument())
  })

  it('lists the schedule day by day from the date, with a link to see more', async () => {
    renderCalendar({ view: 'schedule', date: '2026-12-10' })
    expect(
      screen.getByRole('heading', { level: 1, name: 'Dez. de 2026 – nov. de 2027' }),
    ).toBeInTheDocument()
    const rows = screen.getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent(/^15DEZ\., TER\./)
    expect(screen.queryByText('Avulso')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver mais' })).toHaveAttribute(
      'href',
      '/painel/calendario?modo=programacao&data=2027-12-01',
    )
    await userEvent.click(within(rows[0] ?? document.body).getByRole('button', { name: /Luz/ }))
    expect(await screen.findByLabelText('Detalhes de Luz')).toBeInTheDocument()
  })

  it('says so when the schedule has nothing', () => {
    renderCalendar({ view: 'schedule', data: sampleData({ entries: [] }) })
    expect(screen.getByText('Nenhuma transação neste período.')).toBeInTheDocument()
  })
})
