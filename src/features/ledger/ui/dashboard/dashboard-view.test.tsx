import { DEFAULT_POTS } from '@/features/ledger/core/defaults'
import type { BudgetPlan } from '@/features/ledger/core/types'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LedgerShell } from '../ledger-shell'
import { sampleData, sampleRefs } from '../test-fixtures'
import { DashboardView } from './dashboard-view'
import { initialTab } from './upcoming-bills'

type Result = { ok: true } | { ok: false; error: string }
const markPaidAction = vi.fn<(input: unknown) => Promise<Result>>()
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
vi.mock('@/features/ledger/adapters/actions/payments', () => ({
  markPaidAction: (i: unknown) => markPaidAction(i),
  unmarkPaidAction: vi.fn(),
}))
vi.mock('@/features/ledger/adapters/actions/entries', () => ({
  createEntryAction: vi.fn(),
  updateEntryAction: vi.fn(),
  deleteEntryAction: vi.fn(),
  changeDayAction: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const PLAN: BudgetPlan = {
  id: '00000000-0000-4000-8000-00000000aa02',
  startsMonth: '2026-12',
  targets: Object.fromEntries(DEFAULT_POTS.map((p) => [p.key, p.targetBps])),
}

function renderDashboard(data = sampleData(), plans: BudgetPlan[] = [PLAN]) {
  return render(
    <LedgerShell refs={sampleRefs()}>
      <DashboardView data={data} plans={plans} today="2026-12-15" />
    </LedgerShell>,
  )
}

beforeEach(() => markPaidAction.mockResolvedValue({ ok: true }))
afterEach(() => vi.clearAllMocks())

describe('DashboardView', () => {
  it('sums up balances over every account', () => {
    renderDashboard()
    expect(screen.getByRole('heading', { level: 1, name: 'Painel' })).toBeInTheDocument()
    const summary = screen.getByRole('region', { name: 'Resumo' })
    for (const label of [
      'Saldo hoje',
      'Fim de dez/26',
      'Resultado do mês',
      'Menor saldo previsto',
    ]) {
      expect(within(summary).getByText(label)).toBeInTheDocument()
    }
    expect(within(summary).getByText(/^Entradas R\$ .* · Saídas R\$/)).toBeInTheDocument()
    expect(within(summary).getByText(/até o fim do próximo mês$/)).toBeInTheDocument()
    expect(within(summary).queryByText('–')).not.toBeInTheDocument()
  })

  it('shows six months of the traffic light and the pots of this month', () => {
    renderDashboard()
    expect(screen.getByText('set/26 – fev/27')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Orçamento/ })).toHaveAttribute(
      'href',
      '/painel/orcamento',
    )
    const pots = screen.getByRole('list', { name: 'Potes em dez/26' })
    expect(within(pots).getByText('Essencial')).toBeInTheDocument()
    expect(screen.getByText(/: \d+ dentro, \d+ perto e \d+ fora da meta\.$/)).toBeInTheDocument()
  })

  it('says when no budget version covers this month', () => {
    renderDashboard(sampleData(), [{ ...PLAN, startsMonth: '2027-06' }])
    expect(screen.getByText('Sem metas para este mês')).toBeInTheDocument()
  })

  it('plots the month-end balance of the next 12 months', () => {
    renderDashboard()
    expect(screen.getByRole('img', { name: /^dez\/26: .*; nov\/27: / })).toBeInTheDocument()
  })

  it('plots a balance that only goes down below zero', () => {
    const data = sampleData()
    renderDashboard({
      ...data,
      accounts: data.accounts.map((a) => ({ ...a, openingBalanceCents: -10_000_000 })),
    })
    expect(screen.getByRole('img', { name: /^dez\/26: -R\$/ })).toBeInTheDocument()
  })

  it('draws only positive bars when no month ends below zero', () => {
    const data = sampleData()
    renderDashboard({
      ...data,
      accounts: data.accounts.map((a) => ({ ...a, openingBalanceCents: 100_000_000 })),
    })
    expect(screen.queryByRole('img', { name: /-R\$/ })).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: /^dez\/26: R\$/ })).toBeInTheDocument()
  })

  it('fills the bar of a pot spent without a target', () => {
    renderDashboard(sampleData(), [{ ...PLAN, targets: { essential: 3300 } }])
    expect(screen.getByText(/^R\$ 7\.000,00 \/ R\$ 0,00$/)).toBeInTheDocument()
  })

  it('opens the bills on the most urgent tab and pays in one click', async () => {
    renderDashboard()
    const overdue = screen.getByRole('tab', { name: /Atrasadas/ })
    expect(overdue).toHaveAttribute('aria-selected', 'true')
    // 12 months back: the unpaid Sep–Nov occurrences are overdue too.
    expect(overdue).toHaveTextContent('7')
    await userEvent.click(screen.getByRole('tab', { name: /7 dias/ }))
    const panel = screen.getByRole('tabpanel')
    expect(within(panel).getAllByRole('listitem')).toHaveLength(2)
    await userEvent.click(within(panel).getAllByRole('button', { name: /^Pago/ })[0] ?? panel)
    await waitFor(() => expect(markPaidAction).toHaveBeenCalledOnce())
  })

  it('opens an occurrence in the sheet', async () => {
    renderDashboard()
    const panel = screen.getByRole('tabpanel')
    await userEvent.click(within(panel).getByRole('button', { name: /^Avulso/ }))
    expect(await screen.findByRole('dialog', { name: 'Editar lançamento' })).toBeInTheDocument()
  })

  it('says when a tab has nothing', () => {
    renderDashboard(sampleData({ entries: [], parts: [] }))
    expect(screen.getByRole('tab', { name: /7 dias/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Nada vence nos próximos 7 dias.')).toBeInTheDocument()
  })

  it('asks for a first account before anything else', () => {
    renderDashboard(sampleData({ accounts: [] }))
    expect(screen.getByText('Cadastre seu primeiro banco e conta')).toBeInTheDocument()
  })
})

describe('initialTab', () => {
  it('picks overdue, else the next 7 days, else the first tab with items', () => {
    expect(initialTab([{ key: 'next7' }, { key: 'overdue' }])).toBe('overdue')
    expect(initialTab([{ key: 'nextMonth' }, { key: 'next7' }])).toBe('next7')
    expect(initialTab([{ key: 'nextMonth' }])).toBe('nextMonth')
    expect(initialTab([])).toBe('next7')
  })
})
