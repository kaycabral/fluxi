import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
    expect(screen.getByRole('button', { name: /7,0k Avulso/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /3,0k Saldo/ })).toBeInTheDocument()
    // Day 3 ends at 1200 − 7000 = −5,8k.
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
    await userEvent.click(await screen.findByRole('option', { name: 'Todas as contas' }))
    expect(replace).toHaveBeenCalledWith('/painel/calendario?mes=2026-12', { scroll: false })
  })

  it('opens an entry in the sheet', async () => {
    renderCalendar()
    await userEvent.click(screen.getByRole('button', { name: /Avulso/ }))
    expect(await screen.findByRole('dialog', { name: 'Editar lançamento' })).toBeInTheDocument()
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
    expect(avulso).toHaveAttribute('title', 'Avulso R$ 7.000 (atrasada)')
    expect(avulso).toHaveClass('ring-destructive')
    const transfer = screen.getByRole('button', { name: /Para o Nubank/ })
    expect(transfer).toHaveAttribute('title', 'Para o Nubank R$ 400 (pago)')
    expect(within(transfer).getByLabelText('pago')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Buffet/ })).not.toHaveClass('ring-destructive')
  })

  it('has no balances before the count start', () => {
    renderCalendar('2026-10')
    expect(screen.queryByText(/k$/, { selector: 'span.font-mono' })).not.toBeInTheDocument()
  })
})
