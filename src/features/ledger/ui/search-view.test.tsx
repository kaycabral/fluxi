import { defaultSearchQuery, type SearchQuery } from '@/features/ledger/core/search'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LedgerShell } from './ledger-shell'
import { SearchView } from './search-view'
import { IDS, sampleData, sampleDataWithBenefit, sampleRefs } from './test-fixtures'

const replace = vi.fn<(href: string, options?: unknown) => void>()
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }))
vi.mock('@/features/ledger/adapters/actions/entries', () => ({
  createEntryAction: vi.fn(),
  updateEntryAction: vi.fn(),
  deleteEntryAction: vi.fn(),
  changeDayAction: vi.fn(),
}))

const START = '2026-12'
const MONTHS = ['2026-11', '2026-12', '2027-01', '2027-02']
const base: SearchQuery = { ...defaultSearchQuery(START), to: '2027-01' }

function renderSearch(query: Partial<SearchQuery> = {}, data = sampleData()) {
  return render(
    <LedgerShell refs={sampleRefs()}>
      <SearchView data={data} query={{ ...base, ...query }} start={START} months={MONTHS} />
    </LedgerShell>,
  )
}

function lastHref(): string {
  return replace.mock.calls.at(-1)?.[0] ?? ''
}

afterEach(() => vi.clearAllMocks())

describe('SearchView', () => {
  it('shows totals and the month groups', () => {
    renderSearch()
    expect(screen.getAllByRole('definition')[0]).toHaveTextContent('11')
    const table = screen.getByRole('table')
    expect(within(table).getByText('dez/26')).toBeInTheDocument()
    expect(within(table).getByText('jan/27')).toBeInTheDocument()
    expect(screen.getByText('dez/26 a jan/27')).toBeInTheDocument()
  })

  it('drills down from a group into its occurrences', async () => {
    renderSearch()
    await userEvent.click(
      screen.getAllByRole('button', { name: 'ver lançamentos' })[1] ?? document.body,
    )
    expect(lastHref()).toBe('/painel/lancamentos?de=2027-01&ate=2027-01&agrupar=none')
  })

  it('lists occurrences when not grouped and opens one in the sheet', async () => {
    renderSearch({ group: 'none', kind: 'transfer' })
    expect(screen.getAllByText('interna')).toHaveLength(2)
    await userEvent.click(screen.getAllByText('Para o Nubank')[0] ?? document.body)
    expect(await screen.findByRole('dialog', { name: 'Editar lançamento' })).toBeInTheDocument()
  })

  it('values transfers inside the filtered account', () => {
    renderSearch({ group: 'none', account: IDS.nucc })
    expect(screen.queryByText('interna')).not.toBeInTheDocument()
    expect(screen.getAllByText('R$ 400,00').length).toBeGreaterThan(0)
  })

  it('shows installments, parts and pots in the list', () => {
    renderSearch({ group: 'none' })
    expect(screen.getByText('1/12')).toBeInTheDocument()
    expect(screen.getAllByText('Adiantamento').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Essencial').length).toBeGreaterThan(0)
  })

  it('tints each row with the color of its pot', () => {
    renderSearch({ group: 'none' })
    const rows = screen.getAllByRole('row')
    const essential = rows.find((r) => r.textContent?.includes('Essencial'))
    expect(essential).toHaveAttribute('data-pot', 'essential')
    expect(essential).toHaveClass('bg-violet-500/10')
    const income = rows.find((r) => r.textContent?.includes('Salário'))
    expect(income).toBeDefined()
    expect(income).not.toHaveAttribute('data-pot')
  })

  it('filters by money bucket through the URL', async () => {
    renderSearch({ group: 'none' }, sampleDataWithBenefit())
    expect(screen.getAllByText('Mercado VA').length).toBeGreaterThan(0)
    await userEvent.click(screen.getByLabelText('Dinheiro'))
    await userEvent.click(await screen.findByRole('option', { name: 'Disponível' }))
    expect(lastHref()).toContain('dinheiro=available')
  })

  it('lists only benefit occurrences with Benefícios', () => {
    renderSearch({ group: 'none', money: 'benefit' }, sampleDataWithBenefit())
    expect(screen.getAllByText('Mercado VA').length).toBeGreaterThan(0)
    expect(screen.queryByText('Luz')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remover filtro Benefícios' })).toBeInTheDocument()
  })

  it('updates the URL from the filters', async () => {
    renderSearch()
    await userEvent.click(screen.getByLabelText('Tipo'))
    await userEvent.click(await screen.findByRole('option', { name: 'Saídas' }))
    expect(lastHref()).toContain('tipo=expense')

    await userEvent.click(screen.getByLabelText('Agrupar por'))
    await userEvent.click(await screen.findByRole('option', { name: 'Categoria' }))
    expect(lastHref()).toContain('agrupar=category')

    await userEvent.click(screen.getByLabelText('De'))
    await userEvent.click(await screen.findByRole('option', { name: 'fev/27' }))
    expect(lastHref()).toContain('de=2027-02&ate=2027-02')

    await userEvent.click(screen.getByLabelText('Pote'))
    await userEvent.click(await screen.findByRole('option', { name: 'Conforto' }))
    expect(lastHref()).toContain('pote=comfort')

    await userEvent.click(screen.getByLabelText('Tag'))
    await userEvent.click(await screen.findByRole('option', { name: '#casa' }))
    expect(lastHref()).toContain('tag=casa')

    await userEvent.click(screen.getByLabelText('Categoria'))
    await userEvent.click(await screen.findByRole('option', { name: 'Contas (todas)' }))
    expect(lastHref()).toContain('categoria=g%3AContas')

    await userEvent.click(screen.getByLabelText('Banco ou conta'))
    await userEvent.click(await screen.findByRole('option', { name: 'Nubank (todas)' }))
    expect(lastHref()).toContain(`conta=b%3A${IDS.nu}`)

    await userEvent.click(screen.getByLabelText('Status'))
    await userEvent.click(await screen.findByRole('option', { name: 'Não pagos' }))
    expect(lastHref()).toContain('status=unpaid')

    await userEvent.click(screen.getByLabelText('Até'))
    await userEvent.click(await screen.findByRole('option', { name: 'fev/27' }))
    expect(lastHref()).toContain('ate=2027-02')
  })

  it('debounces the text filter and submits it on Enter', async () => {
    renderSearch()
    await userEvent.type(screen.getByLabelText('Descrição contém'), 'luz')
    await waitFor(() => expect(lastHref()).toContain('q=luz'))
    replace.mockClear()
    await userEvent.type(screen.getByLabelText('Descrição contém'), '{Enter}')
    expect(lastHref()).toContain('q=luz')
  })

  it('clears one or every filter', async () => {
    renderSearch({ text: 'luz', kind: 'expense', tag: 'casa', status: 'paid' })
    expect(screen.getByRole('button', { name: 'Remover filtro Pagos' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Remover filtro "luz"' }))
    expect(lastHref()).not.toContain('q=')
    await userEvent.click(screen.getByRole('button', { name: 'limpar filtros' }))
    expect(lastHref()).toBe('/painel/lancamentos?de=2026-12&ate=2027-01')
  })

  it('says when nothing matches', () => {
    renderSearch({ text: 'inexistente' })
    expect(screen.getByText('Nenhum lançamento encontrado.')).toBeInTheDocument()
  })

  it('says when nothing matches in the list', () => {
    renderSearch({ text: 'inexistente', group: 'none' })
    expect(screen.getByText('Nenhum lançamento encontrado.')).toBeInTheDocument()
  })
})
