import type { CategorizationRule } from '@/features/ledger/core/similar'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RulesSettings } from './rules-settings'

type Result = { ok: true } | { ok: false; error: string }
const remove = vi.fn<(input: unknown) => Promise<Result>>()
vi.mock('@/features/ledger/adapters/actions/categorize', () => ({
  deleteRuleAction: (i: unknown) => remove(i),
}))

afterEach(() => vi.clearAllMocks())

const RULE: CategorizationRule = {
  id: '00000000-0000-4000-8000-00000000d001',
  pattern: 'atm veneza',
  merchantKey: null,
  minCents: 800,
  maxCents: 1500,
  categoryId: 'c',
  categoryName: 'Padaria',
  budgetGroup: 'essential',
  budgetGroupName: 'Essencial',
}

describe('RulesSettings', () => {
  it('explains how to create one when empty', () => {
    render(<RulesSettings rules={[]} onChanged={vi.fn()} />)
    expect(screen.getByText(/Nenhuma regra ainda/)).toBeInTheDocument()
  })

  it('lists the pattern, range and target, and deletes', async () => {
    remove.mockResolvedValue({ ok: true })
    const onChanged = vi.fn()
    render(
      <RulesSettings
        rules={[RULE, { ...RULE, id: 'x', minCents: 500, maxCents: 500, budgetGroupName: null }]}
        onChanged={onChanged}
      />,
    )
    expect(screen.getByText('R$ 8,00 a R$ 15,00 → Padaria · Essencial')).toBeInTheDocument()
    expect(screen.getByText('R$ 5,00 → Padaria')).toBeInTheDocument()
    expect(screen.getAllByText('“atm veneza”')).toHaveLength(2)
    const [first] = screen.getAllByRole('button', { name: 'Excluir regra atm veneza' })
    if (first === undefined) throw new Error('no button')
    await userEvent.click(first)
    expect(remove).toHaveBeenCalledWith({ id: RULE.id })
    await waitFor(() => expect(onChanged).toHaveBeenCalled())
  })

  it('labels a merchant rule', () => {
    render(
      <RulesSettings
        rules={[{ ...RULE, pattern: null, merchantKey: 'padaria pao' }]}
        onChanged={vi.fn()}
      />,
    )
    expect(screen.getByText('Estabelecimento “padaria pao”')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Excluir regra padaria pao' })).toBeInTheDocument()
  })

  it('shows a failure', async () => {
    remove.mockResolvedValue({ ok: false, error: 'Não encontrado.' })
    render(<RulesSettings rules={[RULE]} onChanged={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Excluir regra atm veneza' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Não encontrado.')
  })
})
