import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ScopeDialog } from './scope-dialog'

describe('ScopeDialog', () => {
  it('offers every scope for an amount/day change', async () => {
    const onResolve = vi.fn()
    render(
      <ScopeDialog
        request={{ kind: 'edit', description: 'Luz em dez/26' }}
        onResolve={onResolve}
      />,
    )
    await userEvent.click(screen.getByLabelText(/Só este mês/))
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(onResolve).toHaveBeenCalledWith('one')
  })

  it('resolves nothing when dismissed', async () => {
    const onResolve = vi.fn()
    render(<ScopeDialog request={{ kind: 'delete', description: 'Luz' }} onResolve={onResolve} />)
    await userEvent.keyboard('{Escape}')
    expect(onResolve).toHaveBeenCalledWith(null)
  })

  it('hides "Só este mês" for a new split, even when it was the last choice', async () => {
    const onResolve = vi.fn()
    const { rerender } = render(
      <ScopeDialog request={{ kind: 'edit', description: 'Luz' }} onResolve={onResolve} />,
    )
    await userEvent.click(screen.getByLabelText(/Só este mês/))
    rerender(
      <ScopeDialog
        request={{ kind: 'edit', description: 'Salário', seriesOnly: true }}
        onResolve={onResolve}
      />,
    )
    expect(screen.queryByLabelText(/Só este mês/)).toBeNull()
    expect(screen.getByLabelText(/Este e os próximos/)).toBeChecked()
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }))
    expect(onResolve).toHaveBeenCalledWith('future')
  })
})
