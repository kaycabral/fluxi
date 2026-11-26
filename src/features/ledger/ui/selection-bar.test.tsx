import { EMPTY_SEARCH_QUERY } from '@/features/ledger/core/search'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LedgerShell } from './ledger-shell'
import { SearchView } from './search-view'
import { SelectionBar } from './selection-bar'
import { IDS, sampleData, sampleRefs } from './test-fixtures'

type Result = { ok: true } | { ok: false; error: string }
const categorize = vi.fn<(input: unknown) => Promise<Result>>()
vi.mock('@/features/ledger/adapters/actions/categorize', () => ({
  categorizeEntriesAction: (i: unknown) => categorize(i),
  findSimilarAction: vi.fn(),
}))
vi.mock('@/features/ledger/adapters/actions/entries', () => ({
  createEntryAction: vi.fn(),
  updateEntryAction: vi.fn(),
  deleteEntryAction: vi.fn(),
  changeDayAction: vi.fn(),
}))
vi.mock('@/features/ledger/adapters/actions/undo', () => ({
  undoAction: vi.fn(),
  forgetUndoAction: vi.fn(),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }))

beforeEach(() => categorize.mockResolvedValue({ ok: true }))
afterEach(() => vi.clearAllMocks())

async function choose(label: string, option: string) {
  await userEvent.click(screen.getByLabelText(label))
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

describe('SelectionBar', () => {
  const data = sampleData()

  it('renders nothing without a selection', () => {
    const { container } = render(
      <SelectionBar
        entryIds={[]}
        categories={data.categories}
        pots={data.pots}
        onClear={vi.fn()}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('sets the category or the pot of every selected entry', async () => {
    const onClear = vi.fn()
    render(
      <SelectionBar
        entryIds={[IDS.once, IDS.power]}
        categories={data.categories}
        pots={data.pots}
        onClear={onClear}
      />,
    )
    expect(screen.getByText('2 selecionados')).toBeInTheDocument()
    await choose('Categoria da seleção', 'Academia')
    expect(categorize).toHaveBeenCalledWith({
      entryIds: [IDS.once, IDS.power],
      categoryId: IDS.gymCat,
    })
    expect(await screen.findByText('Categoria aplicado a 2.')).toBeInTheDocument()

    categorize.mockResolvedValue({ ok: false, error: 'Pote inválido.' })
    await choose('Pote da seleção', 'Conforto')
    expect(categorize).toHaveBeenLastCalledWith({ entryIds: [IDS.once, IDS.power], pot: 'comfort' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Pote inválido.')

    await userEvent.click(screen.getByRole('button', { name: /Limpar seleção/ }))
    expect(onClear).toHaveBeenCalled()
  })
})

describe('selection mode in Lançamentos', () => {
  it('toggles rows instead of opening them and shows the bar', async () => {
    render(
      <LedgerShell refs={sampleRefs()}>
        <SearchView data={sampleData()} initialQuery={EMPTY_SEARCH_QUERY} today="2026-12-15" />
      </LedgerShell>,
    )
    await userEvent.click(screen.getByRole('button', { name: /Selecionar/ }))
    const boxes = within(screen.getByRole('list')).getAllByRole('checkbox')
    const [first, second] = boxes
    if (first === undefined || second === undefined) throw new Error('rows missing')
    await userEvent.click(first)
    await userEvent.click(second)
    expect(screen.getByRole('toolbar', { name: 'Ações da seleção' })).toHaveTextContent(
      /2 selecionados|1 selecionado/,
    )
    await userEvent.click(second)
    await userEvent.click(screen.getByRole('button', { name: /Limpar seleção/ }))
    expect(screen.queryByRole('toolbar')).toBeNull()

    // While selecting, rows do not open the editor; "Concluir" leaves the mode.
    expect(within(screen.getByRole('list')).queryAllByRole('button')).toHaveLength(0)
    await userEvent.click(first)
    expect(await screen.findByRole('toolbar')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Concluir/ }))
    expect(screen.queryByRole('toolbar')).toBeNull()
    expect(within(screen.getByRole('list')).queryAllByRole('checkbox')).toHaveLength(0)
  })
})
