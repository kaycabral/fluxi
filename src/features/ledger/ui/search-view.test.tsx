import {
  EMPTY_SEARCH_QUERY,
  parseSearchParams,
  type SearchQuery,
} from '@/features/ledger/core/search'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LedgerShell } from './ledger-shell'
import { SearchView } from './search-view'
import { IDS, sampleData, sampleDataWithBenefit, sampleRefs } from './test-fixtures'
import { transactionsHref } from './transactions-link'

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
vi.mock('next/navigation', async () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: (await import('./test-navigation')).useTestSearchParams,
}))
vi.mock('@/features/ledger/adapters/actions/entries', () => ({
  createEntryAction: vi.fn(),
  updateEntryAction: vi.fn(),
  deleteEntryAction: vi.fn(),
  changeDayAction: vi.fn(),
}))

const TODAY = '2026-12-15'

function renderSearch(query: Partial<SearchQuery> = {}, data = sampleData()) {
  history.replaceState(null, '', transactionsHref({ ...EMPTY_SEARCH_QUERY, ...query }))
  return render(
    <LedgerShell refs={sampleRefs()}>
      <SearchView data={data} today={TODAY} />
    </LedgerShell>,
  )
}

function list() {
  return screen.getByRole('list')
}

function rows() {
  return within(list()).getAllByRole('listitem')
}

/** The query in the URL. */
function remembered(): SearchQuery {
  return parseSearchParams(new URLSearchParams(location.search))
}

async function openFilters() {
  await userEvent.click(screen.getByRole('button', { name: /Filtros/ }))
}

beforeEach(() => history.replaceState(null, '', '/painel/transacoes'))

afterEach(() => vi.clearAllMocks())

describe('SearchView', () => {
  it('lists the whole ledger, oldest first, paged', async () => {
    renderSearch()
    expect(screen.getByRole('heading', { name: 'Transações' })).toBeInTheDocument()
    expect(rows()).toHaveLength(50)
    const iso = rows().map((r) => {
      const d = r.textContent?.match(/\d{2}\/\d{2}\/\d{2}/)?.[0] ?? ''
      return `${d.slice(6, 8)}${d.slice(3, 5)}${d.slice(0, 2)}`
    })
    expect(iso).toEqual([...iso].sort())
    await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }))
    expect(rows().length).toBeGreaterThan(0)
  })

  it('creates an entry from beside the title', async () => {
    renderSearch()
    await userEvent.click(screen.getByRole('button', { name: 'Nova transação' }))
    expect(await screen.findByRole('dialog', { name: 'Nova transação' })).toBeInTheDocument()
  })

  it('sums what the filters left under the title', () => {
    renderSearch({ text: 'luz', from: '2026-12-01', to: '2026-12-31' })
    const summary = screen.getByRole('status', { name: 'Resumo' })
    expect(summary).toHaveTextContent('1 transação')
    expect(summary).toHaveTextContent('Saídas-R$ 260,00')
    expect(summary).toHaveTextContent('Saldo-R$ 260,00')
  })

  it('sorts newest first when asked', async () => {
    renderSearch()
    await openFilters()
    await userEvent.click(screen.getByLabelText('Ordenar'))
    await userEvent.click(await screen.findByRole('option', { name: 'Mais recentes primeiro' }))
    expect(remembered().sort).toBe('desc')
    const iso = rows().map((r) => {
      const d = r.textContent?.match(/\d{2}\/\d{2}\/\d{2}/)?.[0] ?? ''
      return `${d.slice(6, 8)}${d.slice(3, 5)}${d.slice(0, 2)}`
    })
    expect(iso).toEqual([...iso].sort().reverse())
    await userEvent.click(
      screen.getByRole('button', { name: 'Remover filtro Mais recentes primeiro' }),
    )
    expect(remembered().sort).toBe('asc')
  })

  it('reaches far-future days', () => {
    renderSearch({ from: '2030-01-01', to: '2030-12-31', text: 'luz' })
    expect(rows()).toHaveLength(12)
    expect(rows().every((r) => r.textContent?.includes('/30'))).toBe(true)
  })

  it('opens an occurrence in the sheet', async () => {
    renderSearch({ kind: 'transfer' })
    expect(within(list()).getAllByText('interna').length).toBeGreaterThan(0)
    await userEvent.click(within(list()).getAllByText('Para o Nubank')[0] ?? document.body)
    expect(await screen.findByRole('dialog', { name: 'Editar transação' })).toBeInTheDocument()
  })

  it('values transfers inside the filtered account', () => {
    renderSearch({ account: IDS.nucc, kind: 'transfer' })
    expect(screen.queryByText('interna')).not.toBeInTheDocument()
    expect(screen.getAllByText('R$ 400,00').length).toBeGreaterThan(0)
  })

  it('shows installments and parts on each row', () => {
    renderSearch({ to: '2026-12-31' })
    expect(screen.getByText('1/12')).toBeInTheDocument()
    expect(screen.getAllByText('Adiantamento').length).toBeGreaterThan(0)
  })

  it('filters while typing and remembers the search', async () => {
    renderSearch()
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar transações' }), 'luz')
    expect(rows().every((r) => r.textContent?.includes('Luz'))).toBe(true)
    expect(remembered().text).toBe('luz')
  })

  it('starts from the query this browser left', () => {
    renderSearch({ text: 'luz' })
    expect(screen.getByRole('searchbox', { name: 'Buscar transações' })).toHaveValue('luz')
    expect(rows().every((r) => r.textContent?.includes('Luz'))).toBe(true)
  })

  it('filters by day range', async () => {
    renderSearch()
    await openFilters()
    await userEvent.type(screen.getByLabelText('De'), '01/01/2027')
    await userEvent.type(screen.getByLabelText('Até'), '31/01/2027')
    expect(remembered()).toMatchObject({ from: '2027-01-01', to: '2027-01-31' })
    expect(rows().every((r) => r.textContent?.includes('/01/27'))).toBe(true)
    expect(
      screen.getByRole('button', { name: 'Remover filtro 01/01/27 a 31/01/27' }),
    ).toBeInTheDocument()
  })

  it('keeps Até on or after De', async () => {
    renderSearch({ from: '2026-12-01', to: '2027-01-31' })
    await openFilters()
    expect(screen.getByLabelText('De')).toHaveValue('01/12/2026')
    expect(screen.getByLabelText('Até')).toHaveValue('31/01/2027')
    await userEvent.clear(screen.getByLabelText('Até'))
    await userEvent.type(screen.getByLabelText('Até'), '01/11/2026')
    expect(remembered()).toMatchObject({ from: '2026-12-01', to: '2026-12-01' })
  })

  it('remembers the filters behind the Filtros button', async () => {
    renderSearch()
    expect(screen.queryByLabelText('Tipo')).not.toBeInTheDocument()
    await openFilters()
    const pick = async (field: string, option: string) => {
      await userEvent.click(screen.getByLabelText(field))
      await userEvent.click(await screen.findByRole('option', { name: option }))
    }
    await pick('Tipo', 'Saídas')
    await pick('Grupo', 'Conforto')
    await pick('Tag', '#casa')
    await pick('Categoria', 'Contas (todas)')
    await pick('Banco ou conta', 'Nubank (todas)')
    await pick('Status', 'Não pagos')
    await pick('Dinheiro', 'Disponível')
    expect(remembered()).toMatchObject({
      kind: 'expense',
      budgetGroup: 'comfort',
      tag: 'casa',
      category: 'g:Contas',
      account: `b:${IDS.nu}`,
      status: 'unpaid',
      money: 'available',
    })
  })

  it('goes back to every budget group with Todos', async () => {
    renderSearch({ budgetGroup: 'comfort' })
    await openFilters()
    await userEvent.click(screen.getByLabelText('Grupo'))
    await userEvent.click(await screen.findByRole('option', { name: 'Todos' }))
    expect(remembered().budgetGroup).toBe('')
  })

  it('counts the filters in use on the button', () => {
    renderSearch({ text: 'luz', kind: 'expense', status: 'paid', from: '2027-01-01' })
    expect(screen.getByRole('button', { name: /Filtros/ })).toHaveTextContent('Filtros3')
  })

  it('lists only benefit occurrences with Benefícios', () => {
    renderSearch({ money: 'benefit' }, sampleDataWithBenefit())
    expect(screen.getAllByText('Mercado VA').length).toBeGreaterThan(0)
    expect(screen.queryByText('Luz')).not.toBeInTheDocument()
  })

  it('marks paid and received occurrences', () => {
    const data = sampleData()
    renderSearch(
      { to: '2026-12-31' },
      {
        ...data,
        payments: [
          { entryId: IDS.power, month: '2026-12', partId: null, paidOn: '2026-12-15' },
          {
            entryId: IDS.salary,
            month: '2026-12',
            partId: data.parts[0]?.id ?? null,
            paidOn: '2026-12-20',
          },
        ],
      },
    )
    expect(within(list()).getByText('Pago')).toBeInTheDocument()
    expect(within(list()).getByText('Recebido')).toBeInTheDocument()
  })

  it('marks the entries that come from the bank', async () => {
    const data = sampleData()
    renderSearch(
      { text: 'avulso' },
      {
        ...data,
        entries: data.entries.map((e) =>
          e.id === IDS.once ? { ...e, fromBank: true, merchantName: 'Padaria Veneza' } : e,
        ),
      },
    )
    expect(list()).toHaveTextContent('Padaria Veneza ·')
    const mark = within(list()).getByRole('img', { name: 'Vem do banco' })
    await userEvent.hover(mark)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Vem do banco')
  })

  it('clears one or every filter, keeping the search', async () => {
    renderSearch({ text: 'luz', kind: 'expense', status: 'paid', from: '2026-12-01' })
    await userEvent.click(screen.getByRole('button', { name: 'Remover filtro Pagos' }))
    expect(remembered().status).toBe('')
    await userEvent.click(screen.getByRole('button', { name: 'Remover filtro Desde 01/12/26' }))
    expect(remembered().from).toBe('')
    await userEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(remembered()).toEqual({ ...EMPTY_SEARCH_QUERY, text: 'luz' })
  })

  it('resets the filters from the popover', async () => {
    renderSearch({ budgetGroup: 'comfort' })
    await openFilters()
    const clear = screen.getAllByRole('button', { name: 'Limpar filtros' }).at(-1)
    await userEvent.click(clear ?? document.body)
    expect(remembered()).toEqual(EMPTY_SEARCH_QUERY)
  })

  it('tells nothing matched apart from an empty ledger', () => {
    const { unmount } = renderSearch({ text: 'inexistente' })
    expect(screen.getByText('Nenhuma transação encontrada')).toBeInTheDocument()
    unmount()
    renderSearch({}, { ...sampleData(), entries: [] })
    expect(screen.getByText('Nenhuma transação ainda')).toBeInTheDocument()
  })

  it('points to account creation when the space has no account', () => {
    renderSearch({}, { ...sampleData(), entries: [], accounts: [] })
    expect(screen.getByText('Nenhuma conta ainda')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Criar conta' })).toHaveAttribute(
      'href',
      '#configuracoes/contas',
    )
  })
})
