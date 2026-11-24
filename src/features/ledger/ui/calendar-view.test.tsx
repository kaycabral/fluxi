import { changeDayAction, createEntryAction } from '@/features/ledger/adapters/actions/entries'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CalendarView } from './calendar-view'
import { LedgerShell } from './ledger-shell'
import { IDS, sampleData, sampleRefs } from './test-fixtures'

const replace = vi.fn<(href: string, options?: unknown) => void>()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }))
vi.mock('@/features/ledger/adapters/actions/entries', () => ({
  createEntryAction: vi.fn(),
  updateEntryAction: vi.fn(),
  deleteEntryAction: vi.fn(),
  changeDayAction: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function renderCalendar(month = '2026-12', account = '', data = sampleData()) {
  return render(
    <LedgerShell refs={sampleRefs()}>
      <CalendarView data={data} month={month} account={account} today="2026-12-15" />
    </LedgerShell>,
  )
}

afterEach(() => vi.clearAllMocks())

/** The button under a day's entries: a click on any empty spot of the day. */
const emptyPartOf = (day: RegExp) =>
  within(screen.getByRole('group', { name: day })).getByRole('button', { name: /^Criar/ })

describe('CalendarView', () => {
  it('shows entries per day and highlights negative days', () => {
    renderCalendar()
    expect(screen.getByRole('heading', { level: 1, name: 'dezembro de 2026' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /7\.000,00 Avulso/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /3\.000,00 Saldo/ })).toBeInTheDocument()
    // Day 3 ends at 1200 − 7000 = −5.800,00.
    expect(screen.getByRole('group', { name: 'Dia 3, saldo negativo' })).toHaveClass(
      'bg-destructive/10',
    )
    expect(screen.getByRole('link', { name: 'Próximo mês' })).toHaveAttribute(
      'href',
      '/painel?mes=2027-01',
    )
    expect(screen.getByRole('link', { name: 'Hoje' })).toHaveAttribute('href', '/painel')
  })

  it('switches account through the URL and keeps it in the month links', async () => {
    renderCalendar('2026-12', IDS.nucc)
    expect(screen.getByRole('link', { name: 'Mês anterior' })).toHaveAttribute(
      'href',
      `/painel?mes=2026-11&conta=${IDS.nucc}`,
    )
    expect(screen.getByRole('link', { name: 'Hoje' })).toHaveAttribute(
      'href',
      `/painel?conta=${IDS.nucc}`,
    )
    await userEvent.click(screen.getByLabelText('Conta'))
    await userEvent.click(await screen.findByRole('option', { name: 'Todo o disponível' }))
    expect(replace).toHaveBeenCalledWith('/painel?mes=2026-12', { scroll: false })
  })

  it('opens an entry in the sheet', async () => {
    renderCalendar()
    await userEvent.click(screen.getByRole('button', { name: /Avulso/ }))
    expect(await screen.findByRole('dialog', { name: 'Editar lançamento' })).toBeInTheDocument()
  })

  describe('quick add', () => {
    it('opens on a click in an empty part of a day and creates a one-off entry there', async () => {
      vi.mocked(createEntryAction).mockResolvedValue({ ok: true })
      renderCalendar()
      await userEvent.click(emptyPartOf(/^Dia 10(,|$)/))
      const form = await screen.findByRole('form', { name: 'Criar lançamento' })
      expect(form).toHaveTextContent('quinta-feira, 10 de dezembro')
      expect(within(form).getByLabelText('Valor (R$)')).toHaveFocus()
      await userEvent.type(within(form).getByLabelText('Valor (R$)'), '42,90')
      await userEvent.type(within(form).getByLabelText('Descrição'), 'Padaria{Enter}')
      await waitFor(() => expect(createEntryAction).toHaveBeenCalledOnce())
      expect(vi.mocked(createEntryAction).mock.calls[0]?.[0]).toMatchObject({
        fields: {
          kind: 'expense',
          amountCents: 4290,
          description: 'Padaria',
          accountId: IDS.cc,
          startMonth: '2026-12',
          day: 10,
          recurrence: 'none',
          pot: 'variable',
        },
      })
      await waitFor(() =>
        expect(screen.queryByRole('form', { name: 'Criar lançamento' })).not.toBeInTheDocument(),
      )
    })

    it('opens from the day number and shows what is missing', async () => {
      renderCalendar()
      await userEvent.click(
        screen.getByRole('button', { name: 'Criar lançamento em terça-feira, 15 de dezembro' }),
      )
      const form = await screen.findByRole('form', { name: 'Criar lançamento' })
      await userEvent.click(within(form).getByRole('button', { name: 'Salvar' }))
      expect(within(form).getByRole('alert')).toHaveTextContent('Informe o valor.')
      expect(createEntryAction).not.toHaveBeenCalled()
    })

    it('keeps the form open with the error the server returns', async () => {
      vi.mocked(createEntryAction).mockResolvedValue({ ok: false, error: 'Conta não encontrada.' })
      renderCalendar()
      await userEvent.click(emptyPartOf(/^Dia 10(,|$)/))
      const form = await screen.findByRole('form', { name: 'Criar lançamento' })
      await userEvent.type(within(form).getByLabelText('Valor (R$)'), '10')
      await userEvent.type(within(form).getByLabelText('Descrição'), 'Café{Enter}')
      expect(await within(form).findByRole('alert')).toHaveTextContent('Conta não encontrada.')
    })

    it('marks today', () => {
      renderCalendar()
      expect(
        screen.getByRole('button', { name: 'Criar lançamento em terça-feira, 15 de dezembro' }),
      ).toHaveAttribute('aria-current', 'date')
    })

    it('"Mais opções" carries what was typed to the full sheet', async () => {
      renderCalendar()
      await userEvent.click(emptyPartOf(/^Dia 10(,|$)/))
      const form = await screen.findByRole('form', { name: 'Criar lançamento' })
      await userEvent.click(within(form).getByRole('button', { name: 'Entrada' }))
      await userEvent.type(within(form).getByLabelText('Valor (R$)'), '100')
      await userEvent.click(within(form).getByRole('button', { name: 'Mais opções' }))
      const sheet = await screen.findByRole('dialog', { name: 'Novo lançamento' })
      expect(within(sheet).getByLabelText('Data')).toHaveValue('2026-12-10')
      expect(within(sheet).getByLabelText('Valor (R$)')).toHaveValue('100')
      expect(within(sheet).getByRole('button', { name: 'Entrada' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })

    it('does not open when an entry is clicked', async () => {
      renderCalendar()
      await userEvent.click(screen.getByRole('button', { name: /Avulso/ }))
      expect(await screen.findByRole('dialog', { name: 'Editar lançamento' })).toBeInTheDocument()
      expect(screen.queryByRole('form', { name: 'Criar lançamento' })).not.toBeInTheDocument()
    })
  })

  describe('drag to another day', () => {
    const transfer = () => ({ setData: vi.fn(), effectAllowed: '', dropEffect: '' })
    function drag(chip: HTMLElement, day: RegExp) {
      const target = screen.getByRole('group', { name: day })
      const dataTransfer = transfer()
      fireEvent.dragStart(chip, { dataTransfer })
      fireEvent.dragOver(target, { dataTransfer })
      expect(target).toHaveClass('ring-2')
      fireEvent.drop(target, { dataTransfer })
      return target
    }

    it('moves a one-off entry right away, without asking', async () => {
      vi.mocked(changeDayAction).mockResolvedValue({ ok: true })
      renderCalendar()
      const target = drag(screen.getByRole('button', { name: /Avulso/ }), /^Dia 10(,|$)/)
      await waitFor(() =>
        expect(changeDayAction).toHaveBeenCalledWith({
          entryId: IDS.once,
          month: '2026-12',
          day: 10,
          scope: null,
        }),
      )
      expect(within(target).getByRole('button', { name: /Avulso/ })).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('asks the scope of a recurring entry, like a calendar event', async () => {
      vi.mocked(changeDayAction).mockResolvedValue({ ok: true })
      renderCalendar()
      drag(screen.getByRole('button', { name: /Luz/ }), /^Dia 20(,|$)/)
      const dialog = await screen.findByRole('dialog', { name: 'Aplicar a mudança em…' })
      expect(dialog).toHaveTextContent('Luz em dez/26: dia 15 → 20')
      await userEvent.click(within(dialog).getByLabelText(/Só este mês/))
      await userEvent.click(within(dialog).getByRole('button', { name: 'Aplicar' }))
      await waitFor(() =>
        expect(changeDayAction).toHaveBeenCalledWith({
          entryId: IDS.power,
          month: '2026-12',
          day: 20,
          scope: 'one',
        }),
      )
    })

    it('keeps the entry in place when the scope is cancelled or the drop is on the same day', async () => {
      renderCalendar()
      drag(screen.getByRole('button', { name: /Luz/ }), /^Dia 20(,|$)/)
      const dialog = await screen.findByRole('dialog', { name: 'Aplicar a mudança em…' })
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
      drag(screen.getByRole('button', { name: /Avulso/ }), /^Dia 3(,|$)/)
      expect(changeDayAction).not.toHaveBeenCalled()
      const day15 = screen.getByRole('group', { name: /^Dia 15(,|$)/ })
      expect(within(day15).getByRole('button', { name: /Luz/ })).toBeInTheDocument()
    })

    it('reports a refused move', async () => {
      vi.mocked(changeDayAction).mockResolvedValue({ ok: false, error: 'Não deu.' })
      renderCalendar()
      drag(screen.getByRole('button', { name: /Avulso/ }), /^Dia 10(,|$)/)
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Não deu.'))
    })

    it('does not drag the parts of a split entry, nor drops without a drag', () => {
      renderCalendar()
      expect(screen.getByRole('button', { name: /Saldo/ })).toHaveAttribute('draggable', 'false')
      expect(screen.getByRole('button', { name: /Avulso/ })).toHaveAttribute('draggable', 'true')
      const target = screen.getByRole('group', { name: /^Dia 10(,|$)/ })
      fireEvent.dragOver(target, { dataTransfer: transfer() })
      expect(target).not.toHaveClass('ring-2')
      fireEvent.drop(target, { dataTransfer: transfer() })
      fireEvent.dragLeave(target)
      expect(changeDayAction).not.toHaveBeenCalled()
    })
  })

  it('marks paid occurrences and outlines the overdue ones', () => {
    // refs.today is 2026-12-15.
    renderCalendar(
      '2026-12',
      '',
      sampleData({
        payments: [{ entryId: IDS.transfer, month: '2026-12', partId: null, paidOn: '2026-12-06' }],
      }),
    )
    const avulso = screen.getByRole('button', { name: /Avulso/ })
    expect(avulso).toHaveAttribute('title', 'Avulso R$ 7.000,00 (atrasada)')
    expect(avulso).toHaveClass('ring-destructive')
    const transfer = screen.getByRole('button', { name: /Para o Nubank/ })
    expect(transfer).toHaveAttribute('title', 'Para o Nubank R$ 400,00 (pago)')
    expect(within(transfer).getByLabelText('pago')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Buffet/ })).not.toHaveClass('ring-destructive')
  })

  it('has no balances before the count start', () => {
    renderCalendar('2026-10')
    expect(screen.queryByText(/k$/, { selector: 'span.font-mono' })).not.toBeInTheDocument()
  })
})
