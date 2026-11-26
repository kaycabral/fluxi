import { sampleData, sampleRefs } from '@/features/ledger/ui/test-fixtures'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CalendarPage from './(app)/calendario/page'
import ConnectionsPage from './(app)/conexoes/page'
import SearchPage from './(app)/lancamentos/page'
import AppLayout from './(app)/layout'
import BudgetPage from './(app)/orcamento/page'
import DashboardPage from './(app)/page'
import PayablesPage from './(legacy)/a-pagar/page'
import AccountsPage from './(legacy)/contas/page'
import LegacyLayout from './(legacy)/layout'
import TimelinePage from './(legacy)/linha-do-tempo/page'
import PainelLayout from './layout'

type Read<T> = { ok: true; data: T } | { ok: false }

const views = {
  loadRefs: vi.fn<() => Promise<Read<unknown>>>(),
  loadCountFrom: vi.fn<() => Promise<Read<string | null>>>(),
  loadLedgerData:
    vi.fn<(scope: unknown, window: unknown, countFrom: unknown) => Promise<Read<unknown>>>(),
  loadBudgetPlans: vi.fn<(scope: unknown) => Promise<Read<unknown>>>(),
  loadAccountBalances:
    vi.fn<(scope: unknown, first: string, later: string) => Promise<Read<unknown>>>(),
}
vi.mock('@/features/ledger/adapters/views', () => ({
  loadRefs: () => views.loadRefs(),
  loadCountFrom: () => views.loadCountFrom(),
  loadLedgerData: (u: unknown, w: unknown, c: unknown) => views.loadLedgerData(u, w, c),
  loadBudgetPlans: (u: unknown) => views.loadBudgetPlans(u),
  loadAccountBalances: (u: unknown, f: string, l: string) => views.loadAccountBalances(u, f, l),
}))
const PERSONAL = { id: 's1', name: 'Pessoal', kind: 'personal', archived: false } as const
const SCOPE = { userId: 'u1', spaceId: 's1', space: PERSONAL, spaces: [PERSONAL] }
vi.mock('@/app/painel/_lib/session', () => ({
  requirePainelScope: () => Promise.resolve(SCOPE),
  todayIso: () => '2026-12-15',
}))
const getServerScope = vi.fn<() => Promise<typeof SCOPE | null>>()
vi.mock('@/features/spaces/adapters/scope', () => ({ getServerScope: () => getServerScope() }))
const listFeedItems = vi.fn<() => Promise<unknown[]>>()
vi.mock('@/features/spaces/adapters/space.repo', () => ({ listFeedItems: () => listFeedItems() }))
vi.mock('@/features/spaces/adapters/actions/spaces', () => ({
  switchSpaceAction: vi.fn(),
  createSpaceAction: vi.fn(),
  archiveSpaceAction: vi.fn(),
  assignFeedItemAction: vi.fn(),
}))
const getServerUser = vi.fn<() => Promise<{ id: string } | null>>()
vi.mock('@/lib/auth/server', () => ({ getServerUser: () => getServerUser() }))
const redirect = vi.fn<(url: string) => never>()
const notFound = vi.fn<() => never>()
vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirect(url),
  notFound: () => notFound(),
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/painel',
}))
let prefsCookie: string | undefined
let searchCookie: string | undefined
let sidebarCookie: string | undefined
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ 'x-pathname': '/painel/contas' })),
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        const jar: Record<string, string | undefined> = {
          fluxi_calendar: prefsCookie,
          fluxi_lancamentos: searchCookie,
          fluxi_sidebar: sidebarCookie,
        }
        const value = jar[name]
        return value === undefined ? undefined : { value }
      },
    }),
}))
vi.mock('@/features/ledger/ui/timeline-view', () => ({
  TimelineView: ({ window }: { window: { from: string; to: string } }) => (
    <p>timeline {`${window.from}..${window.to}`}</p>
  ),
}))
vi.mock('@/features/ledger/ui/search-view', () => ({
  SearchView: ({ initialQuery }: { initialQuery: { text: string; from: string } }) => (
    <p>search {`${initialQuery.text}@${initialQuery.from}`}</p>
  ),
}))
vi.mock('@/features/ledger/ui/payables-view', () => ({
  PayablesView: ({ window, today }: { window: { from: string; to: string }; today: string }) => (
    <p>payables {`${window.from}..${window.to}@${today}`}</p>
  ),
}))
vi.mock('@/features/ledger/ui/accounts-view', () => ({
  AccountsView: ({ firstMonth }: { firstMonth: string }) => <p>accounts {firstMonth}</p>,
}))
vi.mock('@/features/ledger/ui/budget-view', () => ({
  BudgetView: ({ plans, today }: { plans: unknown[]; today: string }) => (
    <p>budget {`${plans.length}@${today}`}</p>
  ),
}))
vi.mock('@/features/ledger/ui/dashboard/dashboard-view', () => ({
  DashboardView: ({ plans, today }: { plans: unknown[]; today: string }) => (
    <p>dashboard {`${plans.length}@${today}`}</p>
  ),
}))
vi.mock('@/features/ledger/ui/calendar-view', () => ({
  CalendarView: (props: {
    view: string
    date: string
    account: string
    today: string
    prefs: { view: string; weekends: boolean }
  }) => (
    <p>
      calendar {`${props.view} ${props.date}/${props.account}@${props.today}`}
      {props.prefs.weekends ? '' : ' sem fins de semana'}
    </p>
  ),
}))
vi.mock('@/features/ledger/ui/ledger-shell', () => ({
  LedgerShell: ({ children, refs }: { children: React.ReactNode; refs: { banks: unknown[] } }) => (
    <section aria-label={`shell com ${refs.banks.length} bancos`}>{children}</section>
  ),
}))
vi.mock('./_components/topbar', () => ({ Topbar: () => <header>topbar</header> }))
vi.mock('./_components/app-sidebar', () => ({
  AppSidebar: ({ children, defaultOpen }: { children: React.ReactNode; defaultOpen: boolean }) => (
    <div aria-label="menu lateral" role="region" data-open={String(defaultOpen)}>
      {children}
    </div>
  ),
}))

const ok = <T,>(data: T): Read<T> => ({ ok: true, data })

beforeEach(() => {
  views.loadRefs.mockResolvedValue(ok(sampleRefs()))
  views.loadCountFrom.mockResolvedValue(ok('2026-11'))
  views.loadLedgerData.mockResolvedValue(ok(sampleData()))
  views.loadBudgetPlans.mockResolvedValue(ok([{}, {}]))
  views.loadAccountBalances.mockResolvedValue(ok({ firstMonth: '2026-11' }))
  getServerUser.mockResolvedValue({ id: 'u1' })
  getServerScope.mockResolvedValue(SCOPE)
  listFeedItems.mockResolvedValue([])
})
afterEach(() => vi.clearAllMocks())

describe('painel pages', () => {
  it('timeline loads the window around the count start', async () => {
    render(await TimelinePage())
    expect(screen.getByRole('heading', { level: 1, name: 'Linha do tempo' })).toBeInTheDocument()
    expect(screen.getByText('timeline 2026-08..2028-12')).toBeInTheDocument()
  })

  it('a pagar loads from the count start to next month with today', async () => {
    render(await PayablesPage())
    expect(screen.getByRole('heading', { level: 1, name: 'A pagar' })).toBeInTheDocument()
    expect(screen.getByText('payables 2026-11..2027-01@2026-12-15')).toBeInTheDocument()
  })

  it('search loads the whole ledger with the query this browser left', async () => {
    searchCookie = JSON.stringify({ text: 'luz', from: '2027-01-01' })
    render(await SearchPage())
    expect(screen.getByText('search luz@2027-01-01')).toBeInTheDocument()
    expect(views.loadLedgerData).toHaveBeenCalledWith(
      SCOPE,
      { from: '1900-01', to: '9999-12' },
      null,
    )
    searchCookie = undefined
  })

  it('accounts load balances from the count start to a year later', async () => {
    render(await AccountsPage())
    expect(screen.getByText('accounts 2026-11')).toBeInTheDocument()
    expect(views.loadAccountBalances).toHaveBeenCalledWith(SCOPE, '2026-11', '2027-11')
  })

  it('connections list the user’s bank connections with the spaces to route them to', async () => {
    listFeedItems.mockResolvedValueOnce([
      { itemId: 'i1', label: 'Nubank', spaceId: 's1', accounts: ['Conta'] },
    ])
    render(await ConnectionsPage())
    expect(screen.getByRole('heading', { name: 'Conexões bancárias' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Espaço de Nubank' })).toHaveTextContent('Pessoal')
  })

  it('connections degrade when the backend is unavailable', async () => {
    listFeedItems.mockRejectedValueOnce(new Error('db down'))
    render(await ConnectionsPage())
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('budget loads the whole ledger and the budget versions', async () => {
    render(await BudgetPage())
    expect(screen.getByText('budget 2@2026-12')).toBeInTheDocument()
    expect(views.loadLedgerData).toHaveBeenCalledWith(
      SCOPE,
      { from: '1900-01', to: '9999-12' },
      '2026-11',
    )
  })

  it('dashboard loads the whole ledger and the budget versions with today', async () => {
    render(await DashboardPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByText('dashboard 2@2026-12-15')).toBeInTheDocument()
    expect(views.loadBudgetPlans).toHaveBeenCalledWith(SCOPE)
  })

  it('calendar reads view, date and account from the URL and loads what the view needs', async () => {
    render(
      await CalendarPage({
        searchParams: Promise.resolve({ modo: 'semana', data: ['2027-02-27'], conta: 'abc' }),
      }),
    )
    expect(screen.getByText('calendar week 2027-02-27/abc@2026-12-15')).toBeInTheDocument()
    expect(views.loadLedgerData).toHaveBeenLastCalledWith(
      SCOPE,
      { from: '2027-02', to: '2027-02' },
      '2026-11',
    )
  })

  it('calendar falls back to old month links, then today, in the last view used', async () => {
    prefsCookie = JSON.stringify({ view: 'year', weekends: false })
    render(await CalendarPage({ searchParams: Promise.resolve({ mes: '2027-02' }) }))
    expect(
      screen.getByText('calendar year 2027-02-01/@2026-12-15 sem fins de semana'),
    ).toBeInTheDocument()
    prefsCookie = '{nada'
    render(await CalendarPage({ searchParams: Promise.resolve({ data: 'ontem', modo: 'x' }) }))
    expect(screen.getByText('calendar month 2026-12-15/@2026-12-15')).toBeInTheDocument()
    expect(views.loadLedgerData).toHaveBeenLastCalledWith(
      SCOPE,
      { from: '2026-11', to: '2027-01' },
      '2026-11',
    )
    prefsCookie = undefined
  })

  it('old calendar links on /painel go on to /painel/calendario with their params', async () => {
    redirect.mockImplementation(() => {
      throw new Error('redirected')
    })
    await expect(
      DashboardPage({
        searchParams: Promise.resolve({ mes: ['2027-02', '2027-03'], conta: 'abc', x: '1' }),
      }),
    ).rejects.toThrow('redirected')
    expect(redirect).toHaveBeenLastCalledWith('/painel/calendario?mes=2027-02&conta=abc')
    expect(views.loadLedgerData).not.toHaveBeenCalled()
  })

  it('degrades every page when the backend is unavailable', async () => {
    views.loadCountFrom.mockResolvedValue({ ok: false })
    views.loadRefs.mockResolvedValue({ ok: false })
    views.loadLedgerData.mockResolvedValue({ ok: false })
    for (const page of [
      await TimelinePage(),
      await PayablesPage(),
      await SearchPage(),
      await AccountsPage(),
      await BudgetPage(),
      await DashboardPage({ searchParams: Promise.resolve({}) }),
      await CalendarPage({ searchParams: Promise.resolve({}) }),
    ]) {
      const { unmount } = render(page)
      expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
      unmount()
    }
  })
})

describe('painel layouts', () => {
  it('wraps the pages in the ledger shell with the user refs', async () => {
    render(await PainelLayout({ children: <p>conteúdo</p> }))
    expect(screen.getByRole('region', { name: 'shell com 2 bancos' })).toBeInTheDocument()
    expect(screen.getByText('conteúdo')).toBeInTheDocument()
  })

  it('the legacy screens do not exist in production', () => {
    vi.stubEnv('VERCEL_ENV', 'production')
    notFound.mockImplementation(() => {
      throw new Error('not found')
    })
    expect(() => LegacyLayout({ children: null })).toThrow('not found')
    vi.unstubAllEnvs()
  })

  it('the new layout puts the pages in the sidebar shell, as this browser left it', async () => {
    const { unmount } = render(await AppLayout({ children: <p>calendário</p> }))
    const shell = screen.getByRole('region', { name: 'menu lateral' })
    expect(shell).toHaveTextContent('calendário')
    expect(shell).toHaveAttribute('data-open', 'true')
    unmount()
    sidebarCookie = 'collapsed'
    render(await AppLayout({ children: <p>calendário</p> }))
    expect(screen.getByRole('region', { name: 'menu lateral' })).toHaveAttribute(
      'data-open',
      'false',
    )
    sidebarCookie = undefined
  })

  it('the legacy layout keeps the top navigation and the footer', () => {
    render(LegacyLayout({ children: <p>antigo</p> }))
    expect(screen.getByRole('navigation', { name: 'Seções' })).toBeInTheDocument()
    expect(screen.getByText('antigo')).toBeInTheDocument()
    const footer = screen.getByRole('navigation', { name: 'Rodapé' })
    expect(footer).toContainElement(screen.getByRole('link', { name: 'Privacidade' }))
  })

  it('degrades the painel when the spaces cannot be resolved', async () => {
    getServerScope.mockRejectedValueOnce(new Error('db down'))
    render(await PainelLayout({ children: <p>conteúdo</p> }))
    expect(screen.queryByText('conteúdo')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'shell com 0 bancos' })).toBeInTheDocument()
  })

  it('degrades the painel when the session vanishes while resolving the space', async () => {
    getServerScope.mockResolvedValueOnce(null)
    render(await PainelLayout({ children: <p>conteúdo</p> }))
    expect(screen.queryByText('conteúdo')).not.toBeInTheDocument()
  })

  it('keeps the sidebar without the switcher when the spaces cannot be read', async () => {
    getServerScope.mockRejectedValueOnce(new Error('db down'))
    render(await AppLayout({ children: <p>calendário</p> }))
    expect(screen.getByRole('region', { name: 'menu lateral' })).toHaveTextContent('calendário')
  })

  it('falls back to empty refs when the backend is down', async () => {
    views.loadRefs.mockResolvedValue({ ok: false })
    render(await PainelLayout({ children: null }))
    expect(screen.getByRole('region', { name: 'shell com 0 bancos' })).toBeInTheDocument()
  })

  it('redirects a signed-out visitor to the login', async () => {
    getServerUser.mockResolvedValue(null)
    redirect.mockImplementation(() => {
      throw new Error('redirected')
    })
    await expect(PainelLayout({ children: null })).rejects.toThrow('redirected')
    expect(redirect).toHaveBeenCalledWith('/?login=1&next=%2Fpainel%2Fcontas')
  })
})
