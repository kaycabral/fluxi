import type { SimilarCandidate } from '@/features/ledger/core/similar'
import { projectWindow, targetFor } from '@/features/ledger/core/view'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LedgerShell, useLedgerUi } from './ledger-shell'
import { SimilarDialog, type SimilarOffer } from './similar-dialog'
import { IDS, sampleData, sampleRefs } from './test-fixtures'

type Result = { ok: true } | { ok: false; error: string }
const actions = {
  findSimilarAction: vi.fn<(input: unknown) => Promise<unknown>>(),
  categorizeEntriesAction: vi.fn<(input: unknown) => Promise<Result>>(),
  updateEntryAction: vi.fn<(input: unknown) => Promise<Result>>(),
}
vi.mock('@/features/ledger/adapters/actions/categorize', () => ({
  findSimilarAction: (i: unknown) => actions.findSimilarAction(i),
  categorizeEntriesAction: (i: unknown) => actions.categorizeEntriesAction(i),
}))
vi.mock('@/features/ledger/adapters/actions/entries', () => ({
  createEntryAction: vi.fn(),
  updateEntryAction: (i: unknown) => actions.updateEntryAction(i),
  deleteEntryAction: vi.fn(),
  changeDayAction: vi.fn(),
}))
vi.mock('@/features/ledger/adapters/actions/undo', () => ({
  undoAction: vi.fn(),
  forgetUndoAction: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const REF = '00000000-0000-4000-8000-00000000f001'
const SMALL = '00000000-0000-4000-8000-00000000f002'
const BIG = '00000000-0000-4000-8000-00000000f003'
const DONE = '00000000-0000-4000-8000-00000000f004'

const candidate = (over: Partial<SimilarCandidate>): SimilarCandidate => ({
  id: SMALL,
  description: 'ATM VENEZA 02',
  date: '2026-11-12',
  accountId: IDS.cc,
  amountCents: -1200,
  categoryId: null,
  pot: null,
  ...over,
})

const offer = (candidates: SimilarCandidate[]): SimilarOffer => ({
  reference: { id: REF, amountCents: -1000, description: 'ATM VENEZA 01' },
  candidates,
  categoryId: IDS.gymCat,
  pot: 'comfort',
})

const three = () =>
  offer([
    candidate({}),
    candidate({ id: BIG, amountCents: -35000, date: '2026-11-20' }),
    candidate({ id: DONE, categoryId: IDS.powerCat, pot: 'essential' }),
  ])

beforeEach(() => {
  actions.categorizeEntriesAction.mockResolvedValue({ ok: true })
  actions.updateEntryAction.mockResolvedValue({ ok: true })
})
afterEach(() => vi.clearAllMocks())

describe('SimilarDialog', () => {
  it('preselects only small unclassified ones and shows what the others have', async () => {
    const onDone = vi.fn()
    render(<SimilarDialog offer={three()} refs={sampleRefs()} onDone={onDone} />)
    expect(
      screen.getByRole('heading', { name: 'Aplicar a outros 3 lançamentos parecidos?' }),
    ).toBeInTheDocument()
    const boxes = within(screen.getByRole('list', { name: 'Lançamentos parecidos' })).getAllByRole(
      'checkbox',
    )
    expect(boxes.map((b) => b.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false'])
    expect(screen.getByText('Hoje: Energia elétrica · Essencial')).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('Fazer isso sozinho daqui para frente'))
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar a 1' }))
    expect(actions.categorizeEntriesAction).toHaveBeenCalledWith({
      entryIds: [REF, SMALL],
      categoryId: IDS.gymCat,
      pot: 'comfort',
      ruleFromEntryId: REF,
    })
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(1))
  })

  it('lets the user check a far one, uncheck all and only create the rule', async () => {
    const onDone = vi.fn()
    render(<SimilarDialog offer={three()} refs={sampleRefs()} onDone={onDone} />)
    await userEvent.click(
      screen.getByLabelText(/12\/11\/26/, { selector: 'button#' + `similar-${SMALL}` }),
    )
    const apply = screen.getByRole('button', { name: 'Só criar a regra' })
    expect(apply).toBeDisabled()
    await userEvent.click(screen.getByLabelText('Fazer isso sozinho daqui para frente'))
    expect(apply).toBeEnabled()
    await userEvent.click(
      screen.getByLabelText(/20\/11\/26/, { selector: `button#similar-${BIG}` }),
    )
    expect(screen.getByRole('button', { name: 'Aplicar a 1' })).toBeEnabled()
  })

  it('shows a server error and closes with "Agora não"', async () => {
    actions.categorizeEntriesAction.mockResolvedValue({ ok: false, error: 'Falhou.' })
    const onDone = vi.fn()
    render(<SimilarDialog offer={offer([candidate({})])} refs={sampleRefs()} onDone={onDone} />)
    expect(
      screen.getByRole('heading', { name: 'Aplicar a outro lançamento parecido?' }),
    ).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar a 1' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Falhou.')
    await userEvent.click(screen.getByRole('button', { name: 'Agora não' }))
    expect(onDone).toHaveBeenCalledWith(0)
    await userEvent.keyboard('{Escape}')
    expect(onDone).toHaveBeenCalledTimes(2)
  })
})

describe('the entry form offers it after a category change', () => {
  const data = sampleData()
  const [december] = projectWindow(data, '2026-12', '2026-12')
  const landing = december?.landings.find((l) => l.entry.id === IDS.once)

  function Opener() {
    const { openEdit } = useLedgerUi()
    if (landing === undefined) throw new Error('no landing')
    return (
      <button
        onClick={() =>
          openEdit(targetFor(data, { ...landing, entry: { ...landing.entry, fromBank: true } }))
        }
      >
        editar do banco
      </button>
    )
  }

  async function saveWithCategory() {
    render(
      <LedgerShell refs={sampleRefs()}>
        <Opener />
      </LedgerShell>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'editar do banco' }))
    await userEvent.click(screen.getByLabelText('Categoria'))
    await userEvent.click(await screen.findByRole('option', { name: 'Academia' }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
  }

  it('opens the dialog when there are similar entries', async () => {
    actions.findSimilarAction.mockResolvedValue({ ok: true, data: three() })
    await saveWithCategory()
    expect(await screen.findByText('Aplicar a outros 3 lançamentos parecidos?')).toBeInTheDocument()
    expect(actions.findSimilarAction).toHaveBeenCalledWith({ entryId: IDS.once })
    await userEvent.click(screen.getByRole('button', { name: 'Agora não' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull())
  })

  it('just closes when nothing looks alike', async () => {
    actions.findSimilarAction.mockResolvedValue({ ok: true, data: offer([]) })
    await saveWithCategory()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull())
  })

  it('just closes when the lookup fails', async () => {
    actions.findSimilarAction.mockRejectedValue(new Error('down'))
    await saveWithCategory()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull())
  })
})
