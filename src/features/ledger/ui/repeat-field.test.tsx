import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { RepeatField, type RepeatValue } from './repeat-field'

const NONE: RepeatValue = {
  recurrence: 'none',
  repeatEvery: 1,
  monthBy: 'day',
  endMonth: '',
  installments: '',
}

function Harness({
  initial = NONE,
  date = '2026-11-26',
  onChange,
}: {
  initial?: RepeatValue
  date?: string
  onChange?: (value: RepeatValue) => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <RepeatField
      date={date}
      withInstallments
      value={value}
      onChange={(next) => {
        setValue(next)
        onChange?.(next)
      }}
    />
  )
}

async function choose(option: string) {
  await userEvent.click(screen.getByLabelText('Repetição'))
  await userEvent.click(await screen.findByRole('option', { name: option }))
}

async function openCustom() {
  await choose('Personalizar…')
  return screen.findByRole('dialog', { name: 'Recorrência personalizada' })
}

describe('RepeatField', () => {
  it("offers Google Calendar's presets for the date and picks one", async () => {
    const onChange = vi.fn<(value: RepeatValue) => void>()
    render(<Harness onChange={onChange} />)
    await userEvent.click(screen.getByLabelText('Repetição'))
    expect((await screen.findAllByRole('option')).map((o) => o.textContent)).toEqual([
      'Não se repete',
      'Mensal no dia 26',
      'Mensal na quarta quinta-feira',
      'Mensal na última quinta-feira',
      'Anual em 26 de novembro',
      'Parcelado…',
      'Personalizar…',
    ])
    await userEvent.click(screen.getByRole('option', { name: 'Mensal na última quinta-feira' }))
    expect(onChange).toHaveBeenLastCalledWith({
      ...NONE,
      recurrence: 'monthly',
      monthBy: 'last_weekday',
    })
    await choose('Parcelado…')
    expect(onChange).toHaveBeenLastCalledWith({
      ...NONE,
      recurrence: 'installments',
      installments: '12',
    })
  })

  it('builds a yearly rule with an end date', async () => {
    const onChange = vi.fn<(value: RepeatValue) => void>()
    render(<Harness onChange={onChange} />)
    const dialog = await openCustom()
    await userEvent.click(within(dialog).getByLabelText('Unidade'))
    await userEvent.click(await screen.findByRole('option', { name: 'ano' }))
    await userEvent.click(within(dialog).getByLabelText('Em'))
    await userEvent.clear(within(dialog).getByLabelText('Data final'))
    await userEvent.type(within(dialog).getByLabelText('Data final'), '2029-11-25')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Concluir' }))
    expect(onChange).toHaveBeenLastCalledWith({
      ...NONE,
      recurrence: 'yearly',
      endMonth: '2028-11',
    })
    expect(screen.getByLabelText('Repetição')).toHaveTextContent(
      'Anual em 26 de novembro, até nov. de 2028',
    )
  })

  it('reopens a rule with an end where it was and cancels without changes', async () => {
    const onChange = vi.fn<(value: RepeatValue) => void>()
    render(
      <Harness
        initial={{ ...NONE, recurrence: 'monthly', repeatEvery: 2, endMonth: '2027-03' }}
        onChange={onChange}
      />,
    )
    expect(screen.getByLabelText('Repetição')).toHaveTextContent(
      'A cada 2 meses no dia 26, até mar. de 2027',
    )
    // Picking the rule in use again changes nothing.
    await choose('A cada 2 meses no dia 26, até mar. de 2027')
    expect(onChange).not.toHaveBeenCalled()
    const dialog = await openCustom()
    expect(within(dialog).getByLabelText('Repetir a cada:')).toHaveValue(2)
    expect(within(dialog).getByLabelText('Em')).toBeChecked()
    expect(within(dialog).getByLabelText('Data final')).toHaveValue('2027-03-26')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('refuses an interval, a count or an end date that make no sense', async () => {
    render(<Harness />)
    const dialog = await openCustom()
    const concluir = within(dialog).getByRole('button', { name: 'Concluir' })
    await userEvent.clear(within(dialog).getByLabelText('Repetir a cada:'))
    await userEvent.click(concluir)
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Repita a cada 1 a 99.')
    await userEvent.type(within(dialog).getByLabelText('Repetir a cada:'), '1')

    await userEvent.click(within(dialog).getByLabelText('Após'))
    await userEvent.clear(within(dialog).getByLabelText('Ocorrências'))
    await userEvent.click(concluir)
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Informe quantas vezes.')

    await userEvent.click(within(dialog).getByLabelText('Em'))
    await userEvent.clear(within(dialog).getByLabelText('Data final'))
    await userEvent.type(within(dialog).getByLabelText('Data final'), '2026-11-01')
    await userEvent.click(concluir)
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'A data final precisa ser depois do início.',
    )
    await userEvent.click(within(dialog).getByLabelText('Nunca'))
    await userEvent.click(concluir)
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
  })

  it('has only the day rule when the date has no weekday anchor', async () => {
    render(<Harness date="2026-11-30" />)
    const dialog = await openCustom()
    // The 30th is the 5th Monday: only "no dia" and "na última".
    expect(within(dialog).getByLabelText('Na última segunda-feira')).toBeInTheDocument()
    expect(within(dialog).queryByLabelText(/Na quinta segunda-feira/)).not.toBeInTheDocument()
  })
})
