import { sampleData, sampleRefs } from '@/features/ledger/ui/test-fixtures'
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AppLayout from './(app)/layout'
import CalendarPage from './(app)/page'
import PayablesPage from './(legacy)/a-pagar/page'
import AccountsPage from './(legacy)/contas/page'
import SearchPage from './(legacy)/lancamentos/page'
import LegacyLayout from './(legacy)/layout'
import TimelinePage from './(legacy)/linha-do-tempo/page'
import BudgetPage from './(legacy)/orcamento/page'
import OldCalendarPage from './calendario/page'
import PainelLayout from './layout'

type Read<T> = { ok: true; data: T } | { ok: false }

const views = {
  loadRefs: vi.fn<() => Promise<Read<unknown>>>(),
  loadCountFrom: vi.fn<() => Promise<Read<string | null>>>(),
  loadLedgerData:
    vi.fn<(userId: string, window: unknown, countFrom: unknown) => Promise<Read<unknown>>>(),
  loadBudgetData: vi.fn<(userId: string, start: string) => Promise<Read<unknown>>>(),
  loadAccountBalances:
    vi.fn<(userId: string, first: string, later: string) => Promise<Read<unknown>>>(),
}
vi.mock('@/features/ledger/adapters/views', () => ({
  loadRefs: () => views.loadRefs(),
  loadCountFrom: () => views.loadCountFrom(),
  loadLedgerData: (u: string, w: unknown, c: unknown) => views.loadLedgerData(u, w, c),
  loadBudgetData: (u: string, s: string) => views.loadBudgetData(u, s),
  loadAccountBalances: (u: string, f: string, l: string) => views.loadAccountBalances(u, f, l),
}))
vi.mock('@/app/painel/_lib/session', () => ({
  requirePainelUser: () => Promise.resolve({ id: 'u1' }),
  todayIso: () => '2026-12-15',
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
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ 'x-pathname': '/painel/contas' })),
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        name === 'fluxi_calendar' && prefsCookie !== undefined ? { value: prefsCookie } : undefined,
    }),
}))
vi.mock('@/features/ledger/ui/timeline-view', () => ({
  TimelineView: ({ window }: { window: { from: string; to: string } }) => (
    <p>timeline {`${window.from}..${window.to}`}</p>
  ),
}))
vi.mock('@/features/ledger/ui/search-view', () => ({
  SearchView: ({ query }: { query: { text: string; from: string } }) => (
    <p>search {`${query.text}@${query.from}`}</p>
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
  BudgetView: ({ months }: { months: unknown[] }) => <p>budget {months.length}</p>,
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
  AppSidebar: ({ children }: { children: React.ReactNode }) => (
    <div aria-label="menu lateral" role="region">
      {children}
    </div>
  ),
}))

const ok = <T,>(data: T): Read<T> => ({ ok: true, data })

beforeEach(() => {
  views.loadRefs.mockResolvedValue(ok(sampleRefs()))
  views.loadCountFrom.mockResolvedValue(ok('2026-11'))
  views.loadLedgerData.mockResolvedValue(ok(sampleData()))
  views.loadBudgetData.mockResolvedValue(ok({ pots: [], months: [{}, {}] }))
  views.loadAccountBalances.mockResolvedValue(ok({ firstMonth: '2026-11' }))
  getServerUser.mockResolvedValue({ id: 'u1' })
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

  it('search parses the URL query', async () => {
    views.loadCountFrom.mockResolvedValue(ok(null))
    render(await SearchPage({ searchParams: Promise.resolve({ q: 'luz' }) }))
    expect(screen.getByText('search luz@2026-12')).toBeInTheDocument()
    expect(views.loadLedgerData).toHaveBeenCalledWith(
      'u1',
      { from: '2026-12', to: '2027-11' },
      null,
    )
  })

  it('accounts load balances from the count start to a year later', async () => {
    render(await AccountsPage())
    expect(screen.getByText('accounts 2026-11')).toBeInTheDocument()
    expect(views.loadAccountBalances).toHaveBeenCalledWith('u1', '2026-11', '2027-11')
  })

  it('budget loads 12 months from the count start', async () => {
    render(await BudgetPage())
    expect(screen.getByText('budget 2')).toBeInTheDocument()
    expect(views.loadBudgetData).toHaveBeenCalledWith('u1', '2026-11')
  })

  it('calendar reads view, date and account from the URL and loads what the view needs', async () => {
    render(
      await CalendarPage({
        searchParams: Promise.resolve({ modo: 'semana', data: ['2027-02-27'], conta: 'abc' }),
      }),
    )
    expect(screen.getByText('calendar week 2027-02-27/abc@2026-12-15')).toBeInTheDocument()
    expect(views.loadLedgerData).toHaveBeenLastCalledWith(
      'u1',
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
      'u1',
      { from: '2026-11', to: '2027-01' },
      '2026-11',
    )
    prefsCookie = undefined
  })

  it('the old calendar route redirects to /painel keeping month and account', async () => {
    redirect.mockImplementation(() => {
      throw new Error('redirected')
    })
    await expect(
      OldCalendarPage({
        searchParams: Promise.resolve({ mes: ['2027-02', '2027-03'], conta: 'abc', x: '1' }),
      }),
    ).rejects.toThrow('redirected')
    expect(redirect).toHaveBeenLastCalledWith('/painel?mes=2027-02&conta=abc')
    await expect(OldCalendarPage({ searchParams: Promise.resolve({}) })).rejects.toThrow()
    expect(redirect).toHaveBeenLastCalledWith('/painel')
  })

  it('degrades every page when the backend is unavailable', async () => {
    views.loadCountFrom.mockResolvedValue({ ok: false })
    views.loadRefs.mockResolvedValue({ ok: false })
    for (const page of [
      await TimelinePage(),
      await PayablesPage(),
      await SearchPage({ searchParams: Promise.resolve({}) }),
      await AccountsPage(),
      await BudgetPage(),
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

  it('the new layout puts the pages in the sidebar shell', () => {
    render(AppLayout({ children: <p>calendário</p> }))
    expect(screen.getByRole('region', { name: 'menu lateral' })).toHaveTextContent('calendário')
  })

  it('the legacy layout keeps the top navigation and the footer', () => {
    render(LegacyLayout({ children: <p>antigo</p> }))
    expect(screen.getByRole('navigation', { name: 'Seções' })).toBeInTheDocument()
    expect(screen.getByText('antigo')).toBeInTheDocument()
    const footer = screen.getByRole('navigation', { name: 'Rodapé' })
    expect(footer).toContainElement(screen.getByRole('link', { name: 'Privacidade' }))
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
