import { projectWindow, targetFor } from '@/features/ledger/core/view'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultAccountOf, LedgerShell, useLedgerUi } from './ledger-shell'
import { IDS, sampleData, sampleRefs } from './test-fixtures'

type Result = { ok: true } | { ok: false; error: string; scopeRequired?: boolean }
const actions = {
  createEntryAction: vi.fn<(input: unknown) => Promise<Result>>(),
  updateEntryAction: vi.fn<(input: unknown) => Promise<Result>>(),
  deleteEntryAction: vi.fn<(input: unknown) => Promise<Result>>(),
  changeDayAction: vi.fn<(input: unknown) => Promise<Result>>(),
}
vi.mock('@/features/ledger/adapters/actions/undo', () => ({
  undoAction: vi.fn(),
  forgetUndoAction: vi.fn(),
}))
vi.mock('@/features/ledger/adapters/actions/entries', () => ({
  createEntryAction: (i: unknown) => actions.createEntryAction(i),
  updateEntryAction: (i: unknown) => actions.updateEntryAction(i),
  deleteEntryAction: (i: unknown) => actions.deleteEntryAction(i),
  changeDayAction: (i: unknown) => actions.changeDayAction(i),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const data = sampleData()
const months = projectWindow(data, '2026-12', '2027-01')
const landingOf = (id: string, month = '2026-12') => {
  const landing = months.find((m) => m.month === month)?.landings.find((l) => l.entry.id === id)
  if (landing === undefined) throw new Error(`no landing ${id}`)
  return landing
}

function Opener() {
  const { openNew, openEdit } = useLedgerUi()
  return (
    <>
      <button onClick={() => openNew()}>novo</button>
      <button onClick={() => openNew({ month: '2027-02' })}>abrir mês</button>
      <button
        onClick={() =>
          openNew({
            date: '2027-03-09',
            values: { kind: 'income', amount: '50', description: 'Pix' },
          })
        }
      >
        abrir rascunho
      </button>
      <button onClick={() => openEdit(targetFor(data, landingOf(IDS.power, '2027-01')))}>
        editar luz
      </button>
      <button onClick={() => openEdit(targetFor(data, landingOf(IDS.once)))}>editar avulso</button>
      <input aria-label="campo qualquer" />
    </>
  )
}

function renderShell() {
  return render(
    <LedgerShell refs={sampleRefs()}>
      <Opener />
    </LedgerShell>,
  )
}

async function chooseOption(label: string, option: string) {
  await userEvent.click(screen.getByLabelText(label))
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockResolvedValue({ ok: true })
})
afterEach(() => vi.clearAllMocks())

describe('defaultAccountOf', () => {
  it('prefers the first active checking account in bank order', () => {
    expect(defaultAccountOf(sampleRefs())).toBe(IDS.cc)
    expect(defaultAccountOf({ banks: [], accounts: [] })).toBe('')
  })
})

describe('useLedgerUi', () => {
  it('needs the shell', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => render(<Opener />)).toThrow('useLedgerUi must be used inside <LedgerShell>')
  })
})

describe('new entry', () => {
  it('opens from the N shortcut (not while typing); there is no floating button', async () => {
    renderShell()
    expect(screen.queryByRole('button', { name: 'Novo lançamento' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('campo qualquer'))
    await userEvent.keyboard('n')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await userEvent.click(document.body)
    await userEvent.keyboard('n')
    expect(await screen.findByRole('dialog', { name: 'Novo lançamento' })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'novo' }))
    expect(await screen.findByRole('dialog', { name: 'Novo lançamento' })).toBeInTheDocument()
  })

  it('closes the full-page editor with its X', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'novo' }))
    const sheet = await screen.findByRole('dialog', { name: 'Novo lançamento' })
    expect(within(sheet).getByLabelText('Descrição')).toHaveFocus()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Fechar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('opens on a given date with what the quick add typed', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'abrir rascunho' }))
    const sheet = await screen.findByRole('dialog', { name: 'Novo lançamento' })
    expect(within(sheet).getByLabelText('Data')).toHaveValue('09/03/2027')
    expect(within(sheet).getByLabelText('Valor')).toHaveValue('50,00')
    expect(within(sheet).getByLabelText('Descrição')).toHaveValue('Pix')
    expect(within(sheet).getByRole('button', { name: 'Entrada' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )

    // The date is typed dd/mm/aaaa; the entry lands on the last full date.
    const date = within(sheet).getByLabelText('Data')
    await userEvent.clear(date)
    await userEvent.type(date, '03042027')
    expect(date).toHaveValue('03/04/2027')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(actions.createEntryAction).toHaveBeenCalledOnce())
    expect(actions.createEntryAction.mock.calls[0]?.[0]).toMatchObject({
      fields: { startMonth: '2027-04', day: 3, amountCents: 5000 },
    })
  })

  it('creates a monthly expense with tags and a category-suggested pot', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'abrir mês' }))
    const sheet = await screen.findByRole('dialog', { name: 'Novo lançamento' })
    expect(within(sheet).getByLabelText('Data')).toHaveValue('15/02/2027')

    await userEvent.type(within(sheet).getByLabelText('Valor'), '1.234,50')
    await userEvent.type(within(sheet).getByLabelText('Descrição'), 'Academia')
    await chooseOption('Categoria', 'Academia')
    expect(within(sheet).getByLabelText('Pote')).toHaveTextContent('Conforto')
    // Custom repetition, like Google Calendar's: every 2 months on the 3rd Monday, 3 times.
    await chooseOption('Repetição', 'Personalizar…')
    const custom = await screen.findByRole('dialog', { name: 'Recorrência personalizada' })
    await userEvent.clear(within(custom).getByLabelText('Repetir a cada:'))
    await userEvent.type(within(custom).getByLabelText('Repetir a cada:'), '2')
    await userEvent.click(within(custom).getByLabelText('Na terceira segunda-feira'))
    await userEvent.click(within(custom).getByLabelText('Após'))
    await userEvent.clear(within(custom).getByLabelText('Ocorrências'))
    await userEvent.type(within(custom).getByLabelText('Ocorrências'), '3')
    await userEvent.click(within(custom).getByRole('button', { name: 'Concluir' }))
    await waitFor(() => expect(custom).not.toBeInTheDocument())
    expect(within(sheet).getByLabelText('Repetição')).toHaveTextContent(
      'A cada 2 meses na terceira segunda-feira, até jun. de 2027',
    )
    await userEvent.type(within(sheet).getByLabelText('Tags'), 'Saúde,')
    await userEvent.type(within(sheet).getByLabelText('Tags'), 'extra{Enter}')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Remover tag extra' }))
    // The tags in use come up as suggestions: arrows + Enter, or a click.
    await userEvent.type(within(sheet).getByLabelText('Tags'), 'VIA')
    const suggestions = within(sheet).getByRole('listbox', { name: 'Tags em uso' })
    expect(
      within(suggestions)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['#viagem'])
    await userEvent.keyboard('{ArrowDown}{Enter}')
    await userEvent.click(within(sheet).getByLabelText('Tags'))
    await userEvent.click(within(sheet).getByRole('option', { name: '#casa' }))
    expect(within(sheet).queryByRole('listbox')).not.toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Remover tag casa' }))
    // Escape closes only the list; leaving the field adds what was typed.
    await userEvent.type(within(sheet).getByLabelText('Tags'), 'ca{ArrowUp}')
    expect(within(sheet).getByRole('option', { name: '#casa' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await userEvent.keyboard('{Escape}')
    expect(within(sheet).queryByRole('listbox')).not.toBeInTheDocument()
    expect(sheet).toBeInTheDocument()
    await userEvent.tab()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Remover tag ca' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Remover tag viagem' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(actions.createEntryAction).toHaveBeenCalledOnce())
    expect(actions.createEntryAction.mock.calls[0]?.[0]).toMatchObject({
      fields: {
        kind: 'expense',
        description: 'Academia',
        amountCents: 123450,
        accountId: IDS.cc,
        categoryId: IDS.gymCat,
        pot: 'comfort',
        tags: ['saúde'],
        startMonth: '2027-02',
        day: 15,
        recurrence: 'monthly',
        repeatEvery: 2,
        monthBy: 'weekday',
        endMonth: '2027-06',
      },
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('shows validation and server errors, and keeps tipo/conta on "Salvar e criar outro"', async () => {
    actions.createEntryAction.mockResolvedValueOnce({ ok: false, error: 'Falhou no servidor.' })
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'novo' }))
    const sheet = await screen.findByRole('dialog', { name: 'Novo lançamento' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Salvar' }))
    expect(within(sheet).getByRole('alert')).toHaveTextContent('Informe o valor.')

    await userEvent.click(within(sheet).getByRole('button', { name: 'Entrada' }))
    expect(within(sheet).queryByLabelText('Pote')).not.toBeInTheDocument()
    await userEvent.type(within(sheet).getByLabelText('Valor'), '50')
    await userEvent.type(within(sheet).getByLabelText('Descrição'), 'Bônus')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Salvar' }))
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('Falhou no servidor.')

    const saveAndNew = within(sheet).getByRole('button', { name: 'Salvar e criar outro' })
    await waitFor(() => expect(saveAndNew).toBeEnabled())
    await userEvent.click(saveAndNew)
    await waitFor(() => expect(actions.createEntryAction).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(within(sheet).getByLabelText('Valor')).toHaveValue(''))
    expect(within(sheet).getByRole('button', { name: 'Entrada' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('builds transfers and split entries', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'novo' }))
    const sheet = await screen.findByRole('dialog', { name: 'Novo lançamento' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Transferência' }))
    expect(within(sheet).getByLabelText('Para a conta')).toHaveTextContent('BTG · Cartão')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Saída' }))
    // Splitting into dates is only for an income in a "Renda" category.
    const split = () => within(sheet).queryByLabelText(/Dividir em mais de uma data/)
    expect(split()).not.toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Entrada' }))
    expect(split()).not.toBeInTheDocument()
    await chooseOption('Categoria', 'Energia elétrica')
    expect(split()).not.toBeInTheDocument()
    await chooseOption('Categoria', 'Salário')
    await chooseOption('Repetição', 'Parcelado…')
    expect(within(sheet).getByLabelText('Parcelas')).toHaveValue(12)
    expect(within(sheet).getByLabelText('Repetição')).toHaveTextContent('Parcelado…')

    await userEvent.click(within(sheet).getByLabelText(/Dividir em mais de uma data/))
    expect(within(sheet).getByText('soma 100%')).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Parte' }))
    await userEvent.clear(within(sheet).getByLabelText('Percentual da parte 3'))
    await userEvent.type(within(sheet).getByLabelText('Percentual da parte 3'), '10')
    expect(within(sheet).getByText('soma 110%')).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Remover parte 3' }))
    await userEvent.clear(within(sheet).getByLabelText('Nome da parte 1'))
    await userEvent.type(within(sheet).getByLabelText('Nome da parte 1'), 'Entrada')
    await userEvent.clear(within(sheet).getByLabelText('Dia da parte 1'))
    await userEvent.type(within(sheet).getByLabelText('Dia da parte 1'), '18')
    await userEvent.click(
      within(sheet).getByLabelText('mês seguinte', { selector: '#entry-part-next-1' }),
    )
    await userEvent.type(within(sheet).getByLabelText('Valor total'), '100000')
    expect(within(sheet).getByText(/^1× R\$\s83,37 \+ 11× R\$\s83,33$/)).toBeInTheDocument()
    await userEvent.type(within(sheet).getByLabelText('Descrição'), 'Notebook')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Salvar' }))

    await waitFor(() => expect(actions.createEntryAction).toHaveBeenCalledOnce())
    expect(actions.createEntryAction.mock.calls[0]?.[0]).toMatchObject({
      fields: {
        recurrence: 'installments',
        installments: 12,
        day: 18,
        parts: [
          { label: 'Entrada', bps: 4000, day: 18, nextMonth: false },
          { label: 'Saldo', bps: 6000, day: 5, nextMonth: false },
        ],
      },
    })
  })
})

describe('editing', () => {
  it('asks the scope when an occurrence amount changes', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'editar luz' }))
    const sheet = await screen.findByRole('dialog', { name: 'Editar lançamento' })
    expect(within(sheet).getByText(/Editando jan\/27/)).toBeInTheDocument()
    const amount = within(sheet).getByLabelText('Valor')
    expect(amount).toHaveValue('260,00')

    await userEvent.clear(amount)
    await userEvent.type(amount, '30000')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Salvar' }))
    const scope = await screen.findByRole('dialog', { name: 'Aplicar a mudança em…' })
    expect(scope).toHaveTextContent('Luz em jan/27: valor R$ 260,00 → R$ 300,00')
    await userEvent.click(within(scope).getByRole('button', { name: 'Cancelar' }))
    expect(actions.updateEntryAction).not.toHaveBeenCalled()

    await userEvent.click(within(sheet).getByRole('button', { name: 'Salvar' }))
    const again = await screen.findByRole('dialog', { name: 'Aplicar a mudança em…' })
    await userEvent.click(within(again).getByLabelText(/Só este mês/))
    await userEvent.click(within(again).getByRole('button', { name: 'Aplicar' }))
    await waitFor(() =>
      expect(actions.updateEntryAction).toHaveBeenCalledWith(
        expect.objectContaining({ entryId: IDS.power, month: '2027-01', scope: 'one' }),
      ),
    )
  })

  it('saves series fields without asking when amount and day are unchanged', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'editar luz' }))
    const sheet = await screen.findByRole('dialog', { name: 'Editar lançamento' })
    await userEvent.type(within(sheet).getByLabelText('Descrição'), ' casa')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(actions.updateEntryAction).toHaveBeenCalledOnce())
    expect(actions.updateEntryAction.mock.calls[0]?.[0]).toMatchObject({
      scope: null,
      fields: { description: 'Luz casa' },
    })
  })

  it('deletes an occurrence with a scope and a one-off entry directly', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'editar luz' }))
    let sheet = await screen.findByRole('dialog', { name: 'Editar lançamento' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Excluir' }))
    const scope = await screen.findByRole('dialog', { name: 'Excluir em…' })
    await userEvent.click(within(scope).getByRole('button', { name: 'Excluir' }))
    await waitFor(() =>
      expect(actions.deleteEntryAction).toHaveBeenCalledWith({
        entryId: IDS.power,
        month: '2027-01',
        scope: 'future',
      }),
    )

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: 'editar avulso' }))
    sheet = await screen.findByRole('dialog', { name: 'Editar lançamento' })
    actions.deleteEntryAction.mockResolvedValueOnce({ ok: false, error: 'Não encontrado.' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Excluir' }))
    expect(await within(sheet).findByRole('alert')).toHaveTextContent('Não encontrado.')
    expect(actions.deleteEntryAction).toHaveBeenLastCalledWith({
      entryId: IDS.once,
      month: null,
      scope: 'all',
    })
  })

  it('duplicates into a new entry', async () => {
    renderShell()
    await userEvent.click(screen.getByRole('button', { name: 'editar avulso' }))
    const sheet = await screen.findByRole('dialog', { name: 'Editar lançamento' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Duplicar' }))
    expect(await screen.findByRole('dialog', { name: 'Novo lançamento' })).toBeInTheDocument()
    expect(screen.getByLabelText('Descrição')).toHaveValue('Avulso (cópia)')
  })
})
