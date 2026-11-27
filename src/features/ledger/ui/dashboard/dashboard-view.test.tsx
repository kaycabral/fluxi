import {
  connectionBankKey,
  connectionHealth,
  NEVER_CHECKED,
} from '@/features/bank-feed/core/health'
import { DEFAULT_BUDGET_GROUPS } from '@/features/ledger/core/defaults'
import type { BudgetVersion } from '@/features/ledger/core/types'
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

const PLAN: BudgetVersion = {
  id: '00000000-0000-4000-8000-00000000aa02',
  startsMonth: '2026-12',
  targets: Object.fromEntries(DEFAULT_BUDGET_GROUPS.map((p) => [p.key, p.targetBps])),
}

function renderDashboard(data = sampleData(), versions: BudgetVersion[] = [PLAN]) {
  return render(
    <LedgerShell refs={sampleRefs()}>
      <DashboardView data={data} versions={versions} today="2026-12-15" />
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

  it('shows five months of the budget, from the current month, and the budget groups of this month', async () => {
    renderDashboard()
    expect(screen.getByRole('heading', { level: 2, name: 'Orçamento' })).toBeInTheDocument()
    expect(screen.queryByText('Semáforo do orçamento')).not.toBeInTheDocument()
    const months = () =>
      screen
        .getAllByRole('columnheader')
        .slice(1)
        .map((h) => h.textContent)
    expect(months()).toEqual(['dez/26', 'jan/27', 'fev/27', 'mar/27', 'abr/27'])
    // No range label and no legend: each cell says its state on hover.
    expect(screen.queryByText(/^\w{3}\/\d{2} – \w{3}\/\d{2}$/)).not.toBeInTheDocument()
    expect(screen.queryByText('Dentro da meta')).not.toBeInTheDocument()
    expect(screen.queryByText('Sem meta no mês')).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /^Essencial em dez\/26: .*meta/ })).toHaveLength(1)

    const today = screen.getByRole('button', { name: 'Hoje' })
    expect(today).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Próximo mês' }))
    expect(months()).toEqual(['jan/27', 'fev/27', 'mar/27', 'abr/27', 'mai/27'])
    await userEvent.click(today)
    expect(months()).toEqual(['dez/26', 'jan/27', 'fev/27', 'mar/27', 'abr/27'])

    expect(screen.getByRole('link', { name: /Orçamento/ })).toHaveAttribute(
      'href',
      '/painel/orcamento',
    )
    const budgetGroups = screen.getByRole('list', { name: 'Grupos em dez/26' })
    expect(within(budgetGroups).getByText('Essencial')).toBeInTheDocument()
    expect(screen.getByText(/: \d+ dentro, \d+ perto e \d+ fora da meta\.$/)).toBeInTheDocument()
  })

  it("shows the banks behind today's balance, with their balances on hover", async () => {
    const data = sampleData()
    const bankOf = data.accounts[0]?.bankId ?? ''
    const extra = ['Banco A', 'Banco B', 'Banco C', 'Banco D'].map((name, i) => ({
      id: `00000000-0000-4000-8000-0000000bb0${i}0`,
      name,
      sort: 10 + i,
      archived: false,
    }))
    renderDashboard({
      ...data,
      banks: [...data.banks, ...extra],
      accounts: [
        ...data.accounts,
        ...extra.map((bank, i) => ({
          id: `00000000-0000-4000-8000-0000000cc0${i}0`,
          bankId: bank.id,
          name: 'Conta',
          type: 'checking' as const,
          openingBalanceCents: (i + 1) * 100,
          archived: false,
        })),
        {
          id: '00000000-0000-4000-8000-0000000cc090',
          bankId: bankOf,
          name: 'Antiga',
          type: 'checking' as const,
          openingBalanceCents: 999_999_00,
          archived: true,
        },
      ],
    })
    const summary = screen.getByRole('region', { name: 'Resumo' })
    const avatars = within(summary).getByRole('button', { name: /^Saldo por banco: / })
    const banks = data.banks.length + extra.length
    expect(within(avatars).getByText(`+${banks - 4}`)).toBeInTheDocument()
    await userEvent.hover(avatars)
    const list = (await screen.findAllByRole('list', { name: 'Saldo por banco' }))[0]
    if (list === undefined) throw new Error('no breakdown')
    const rows = within(list).getAllByRole('listitem')
    expect(rows).toHaveLength(banks)
    // Highest first: D before A, the overdrawn BTG last.
    expect(rows.map((r) => r.textContent)).toContain('Banco DR$ 4,00')
    const text = rows.map((r) => r.textContent ?? '')
    expect(text.findIndex((t) => t === 'Banco DR$ 4,00')).toBeLessThan(
      text.findIndex((t) => t === 'Banco AR$ 1,00'),
    )
    expect(text.at(-1)).toMatch(/^BTG-R\$/)
    // The archived account stays out of every bank.
    expect(list).not.toHaveTextContent('999.999')
  })

  it('shows the connection health next to connected banks only', async () => {
    const health = connectionHealth(
      { ...NEVER_CHECKED, itemStatus: 'LOGIN_ERROR', checkedAt: '2026-12-15T09:00:00.000Z' },
      new Date('2026-12-15T12:00:00.000Z'),
    )
    render(
      <LedgerShell refs={sampleRefs()}>
        <DashboardView
          data={sampleData()}
          versions={[PLAN]}
          today="2026-12-15"
          connectedBanks={['Nubank Empresas']}
          bankHealth={{ [connectionBankKey('Nubank Empresas')]: health }}
        />
      </LedgerShell>,
    )
    await userEvent.hover(screen.getByRole('button', { name: /^Saldo por banco: / }))
    const list = (await screen.findAllByRole('list', { name: 'Saldo por banco' }))[0]
    if (list === undefined) throw new Error('no breakdown')
    // Only the connected bank has a dot; manual banks have none.
    expect(within(list).getAllByRole('img')).toHaveLength(1)
    const row = within(list)
      .getAllByRole('listitem')
      .find((r) => r.textContent?.startsWith('Nubank Empresas'))
    if (row === undefined) throw new Error('no connected bank row')
    expect(within(row).getByRole('img')).toHaveAccessibleName(
      'Conexão: O banco pediu nova autorização: reconecte no Meu Pluggy',
    )
  })

  it('says when the connected banks were last read, beside the avatars', () => {
    const at = (checkedAt: string | null) =>
      connectionHealth(
        { ...NEVER_CHECKED, itemStatus: 'UPDATED', lastUpdatedAt: checkedAt, checkedAt },
        new Date('2026-12-15T12:00:00.000Z'),
      )
    const view = (health: Record<string, ReturnType<typeof at>>) => (
      <LedgerShell refs={sampleRefs()}>
        <DashboardView
          data={sampleData()}
          versions={[PLAN]}
          today="2026-12-15"
          connectedBanks={['Nubank Empresas']}
          bankHealth={health}
        />
      </LedgerShell>
    )
    // 06:00 in São Paulo.
    const { rerender } = render(
      view({ [connectionBankKey('Nubank Empresas')]: at('2026-12-15T09:00:00.000Z') }),
    )
    const summary = screen.getByRole('region', { name: 'Resumo' })
    expect(within(summary).getByText('Atualizado hoje, 06:00')).toBeInTheDocument()
    rerender(view({ [connectionBankKey('Nubank Empresas')]: at('2026-12-10T09:00:00.000Z') }))
    expect(within(summary).getByText('Atualizado 10/12 às 06:00')).toBeInTheDocument()
    rerender(view({ [connectionBankKey('Nubank Empresas')]: at(null) }))
    expect(within(summary).getByText('Aguardando a 1ª atualização')).toBeInTheDocument()
    rerender(view({}))
    expect(within(summary).queryByText(/^Atualizado|^Aguardando/)).toBeNull()
  })

  it('shows a bank connected in the space with no linked account at R$ 0,00', async () => {
    render(
      <LedgerShell refs={sampleRefs()}>
        <DashboardView
          data={sampleData()}
          versions={[PLAN]}
          today="2026-12-15"
          connectedBanks={['Nubank Empresas']}
        />
      </LedgerShell>,
    )
    const avatars = screen.getByRole('button', { name: /^Saldo por banco: .*Nubank Empresas/ })
    await userEvent.hover(avatars)
    const list = (await screen.findAllByRole('list', { name: 'Saldo por banco' }))[0]
    if (list === undefined) throw new Error('no breakdown')
    const row = within(list)
      .getAllByRole('listitem')
      .find((r) => r.textContent?.startsWith('Nubank Empresas'))
    expect(row).toHaveTextContent(/^Nubank EmpresasR\$ 0,00$/)
  })

  it('shows no bank avatars when no account counts in the balance', () => {
    const data = sampleData()
    renderDashboard({ ...data, accounts: data.accounts.map((a) => ({ ...a, archived: true })) })
    expect(screen.queryByRole('button', { name: /^Saldo por banco/ })).not.toBeInTheDocument()
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

  it('fills the bar of a budget group spent without a target', () => {
    renderDashboard(sampleData(), [{ ...PLAN, targets: { essential: 3300 } }])
    const pair = screen.getByText(/^7\.000,00 \/ 0,00$/)
    expect(pair).toHaveAccessibleName('R$ 7.000,00 planejado de R$ 0,00')
  })

  it('opens the bills on the most urgent tab and pays in one click', async () => {
    renderDashboard()
    expect(screen.getByRole('heading', { level: 2, name: 'Contas' })).toBeInTheDocument()
    expect(screen.queryByText('Próximas contas')).not.toBeInTheDocument()
    expect(
      screen.queryByText('O que falta pagar ou receber, por urgência.'),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/^A pagar R\$/)).not.toBeInTheDocument()
    const overdue = screen.getByRole('tab', { name: /Atrasadas/ })
    expect(overdue).toHaveAttribute('aria-selected', 'true')
    // 12 months back: the unpaid Sep–Nov occurrences are overdue too.
    expect(overdue).toHaveTextContent('7')
    await userEvent.click(screen.getByRole('tab', { name: /7 dias/ }))
    const panel = screen.getByRole('tabpanel')
    expect(within(panel).getAllByRole('listitem')).toHaveLength(2)
    await userEvent.click(
      within(panel).getAllByRole('button', { name: /^Marcar como pago/ })[0] ?? panel,
    )
    await waitFor(() => expect(markPaidAction).toHaveBeenCalledOnce())
  })

  it('opens an occurrence in the sheet', async () => {
    renderDashboard()
    const panel = screen.getByRole('tabpanel')
    await userEvent.click(within(panel).getByRole('button', { name: /^Avulso/ }))
    expect(await screen.findByRole('dialog', { name: 'Editar transação' })).toBeInTheDocument()
  })

  it('says when a tab has nothing', () => {
    renderDashboard(sampleData({ entries: [], parts: [] }))
    expect(screen.getByRole('tab', { name: /7 dias/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Nada vence nos próximos 7 dias.')).toBeInTheDocument()
  })

  it('asks for a first account before anything else', () => {
    renderDashboard(sampleData({ accounts: [] }))
    expect(screen.getByText('Cadastre seu primeiro banco e conta')).toBeInTheDocument()
    // Opens Configurações → Contas, where the first account is created.
    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute(
      'href',
      '#configuracoes/contas',
    )
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
