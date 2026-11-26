import {
  EMPTY_SEARCH_QUERY,
  parseSearchQuery,
  SEARCH_QUERY_COOKIE,
  type SearchQuery,
} from '@/features/ledger/core/search'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LedgerShell } from './ledger-shell'
import { SearchView } from './search-view'
import { IDS, sampleData, sampleDataWithBenefit, sampleRefs } from './test-fixtures'

vi.mock('@/features/ledger/adapters/actions/undo', () => ({
  undoAction: vi.fn(),
  forgetUndoAction: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }))
vi.mock('@/features/ledger/adapters/actions/entries', () => ({
  createEntryAction: vi.fn(),
  updateEntryAction: vi.fn(),
  deleteEntryAction: vi.fn(),
  changeDayAction: vi.fn(),
}))

const TODAY = '2026-12-15'

function renderSearch(query: Partial<SearchQuery> = {}, data = sampleData()) {
  return render(
    <LedgerShell refs={sampleRefs()}>
      <SearchView data={data} initialQuery={{ ...EMPTY_SEARCH_QUERY, ...query }} today={TODAY} />
    </LedgerShell>,
  )
}

function list() {
  return screen.getByRole('list')
}

function rows() {
  return within(list()).getAllByRole('listitem')
}

/** The query remembered in the cookie. */
function remembered(): SearchQuery {
  const raw = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${SEARCH_QUERY_COOKIE}=`))
    ?.slice(SEARCH_QUERY_COOKIE.length + 1)
  return parseSearchQuery(raw === undefined ? undefined : decodeURIComponent(raw))
}

async function openFilters() {
  await userEvent.click(screen.getByRole('button', { name: /Filtros/ }))
}

// The cookie is scoped to the page's path.
beforeEach(() => window.history.replaceState(null, '', '/painel/lancamentos'))

afterEach(() => {
  vi.clearAllMocks()
  document.cookie = `${SEARCH_QUERY_COOKIE}=; Path=/painel/lancamentos; Max-Age=0`
})

describe('SearchView', () => {
  it('lists the whole ledger, newest first, paged', async () => {
    renderSearch()
    expect(screen.getByRole('heading', { name: 'Lançamentos' })).toBeInTheDocument()
    expect(rows()).toHaveLength(50)
    const iso = rows().map((r) => {
      const d = r.textContent?.match(/\d{2}\/\d{2}\/\d{2}/)?.[0] ?? ''
      return `${d.slice(6, 8)}${d.slice(3, 5)}${d.slice(0, 2)}`
    })
    expect(iso).toEqual([...iso].sort().reverse())
    await userEvent.click(screen.getByRole('button', { name: 'Próxima página' }))
    expect(rows().length).toBeGreaterThan(0)
  })

  it('creates an entry from beside the title', async () => {
    renderSearch()
    await userEvent.click(screen.getByRole('button', { name: 'Criar' }))
    expect(await screen.findByRole('dialog', { name: 'Novo lançamento' })).toBeInTheDocument()
  })

  it('sums what the filters left under the title', () => {
    renderSearch({ text: 'luz', from: '2026-12-01', to: '2026-12-31' })
    const summary = screen.getByRole('status', { name: 'Resumo' })
    expect(summary).toHaveTextContent('1 lançamento')
    expect(summary).toHaveTextContent('Saídas-R$ 260,00')
    expect(summary).toHaveTextContent('Saldo-R$ 260,00')
  })

  it('sorts oldest first when asked', async () => {
    renderSearch()
    await openFilters()
    await userEvent.click(screen.getByLabelText('Ordenar'))
    await userEvent.click(await screen.findByRole('option', { name: 'Mais antigos primeiro' }))
    expect(remembered().sort).toBe('asc')
    const iso = rows().map((r) => {
      const d = r.textContent?.match(/\d{2}\/\d{2}\/\d{2}/)?.[0] ?? ''
      return `${d.slice(6, 8)}${d.slice(3, 5)}${d.slice(0, 2)}`
    })
    expect(iso).toEqual([...iso].sort())
    await userEvent.click(
      screen.getByRole('button', { name: 'Remover filtro Mais antigos primeiro' }),
    )
    expect(remembered().sort).toBe('desc')
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
    expect(await screen.findByRole('dialog', { name: 'Editar lançamento' })).toBeInTheDocument()
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
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar lançamentos' }), 'luz')
    expect(rows().every((r) => r.textContent?.includes('Luz'))).toBe(true)
    expect(remembered().text).toBe('luz')
  })

  it('starts from the query this browser left', () => {
    renderSearch({ text: 'luz' })
    expect(screen.getByRole('searchbox', { name: 'Buscar lançamentos' })).toHaveValue('luz')
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
    await pick('Pote', 'Conforto')
    await pick('Tag', '#casa')
    await pick('Categoria', 'Contas (todas)')
    await pick('Banco ou conta', 'Nubank (todas)')
    await pick('Status', 'Não pagos')
    await pick('Dinheiro', 'Disponível')
    expect(remembered()).toMatchObject({
      kind: 'expense',
      pot: 'comfort',
      tag: 'casa',
      category: 'g:Contas',
      account: `b:${IDS.nu}`,
      status: 'unpaid',
      money: 'available',
    })
  })

  it('goes back to every pot with Todos', async () => {
    renderSearch({ pot: 'comfort' })
    await openFilters()
    await userEvent.click(screen.getByLabelText('Pote'))
    await userEvent.click(await screen.findByRole('option', { name: 'Todos' }))
    expect(remembered().pot).toBe('')
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
        entries: data.entries.map((e) => (e.id === IDS.once ? { ...e, fromBank: true } : e)),
      },
    )
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
    renderSearch({ pot: 'comfort' })
    await openFilters()
    const clear = screen.getAllByRole('button', { name: 'Limpar filtros' }).at(-1)
    await userEvent.click(clear ?? document.body)
    expect(remembered()).toEqual(EMPTY_SEARCH_QUERY)
  })

  it('tells nothing matched apart from an empty ledger', () => {
    const { unmount } = renderSearch({ text: 'inexistente' })
    expect(screen.getByText('Nenhum lançamento encontrado')).toBeInTheDocument()
    unmount()
    renderSearch({}, { ...sampleData(), entries: [] })
    expect(screen.getByText('Nenhum lançamento ainda')).toBeInTheDocument()
  })
})
