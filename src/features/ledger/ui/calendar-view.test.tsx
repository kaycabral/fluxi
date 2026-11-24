import { changeDayAction } from '@/features/ledger/adapters/actions/entries'
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
      <CalendarView data={data} month={month} account={account} />
    </LedgerShell>,
  )
}

afterEach(() => vi.clearAllMocks())

describe('CalendarView', () => {
  it('shows entries per day and highlights negative days', () => {
    renderCalendar()
    expect(screen.getByRole('heading', { name: 'Calendário · dez/26' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /7\.000,00 Avulso/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /3\.000,00 Saldo/ })).toBeInTheDocument()
    // Day 3 ends at 1200 − 7000 = −5.800,00.
    expect(screen.getByRole('group', { name: 'Dia 3, saldo negativo' })).toHaveClass(
      'bg-destructive/10',
    )
    expect(screen.getByRole('link', { name: 'Próximo mês' })).toHaveAttribute(
      'href',
      '/painel/calendario?mes=2027-01',
    )
  })

  it('switches account through the URL and keeps it in the month links', async () => {
    renderCalendar('2026-12', IDS.nucc)
    expect(screen.getByRole('link', { name: 'Mês anterior' })).toHaveAttribute(
      'href',
      `/painel/calendario?mes=2026-11&conta=${IDS.nucc}`,
    )
    await userEvent.click(screen.getByLabelText('Conta'))
    await userEvent.click(await screen.findByRole('option', { name: 'Todo o disponível' }))
    expect(replace).toHaveBeenCalledWith('/painel/calendario?mes=2026-12', { scroll: false })
  })

  it('opens an entry in the sheet', async () => {
    renderCalendar()
    await userEvent.click(screen.getByRole('button', { name: /Avulso/ }))
    expect(await screen.findByRole('dialog', { name: 'Editar lançamento' })).toBeInTheDocument()
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
      const luz = screen.getByRole('button', { name: /Luz/ })
      expect(luz.closest('[role="group"]')).toHaveAccessibleName(/^Dia 15(,|$)/)
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
