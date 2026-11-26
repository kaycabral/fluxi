import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BankLogo } from './bank-logo'

describe('BankLogo', () => {
  it('uses the official logo of a known bank', () => {
    render(<BankLogo name="Nu Empresas" />)
    expect(screen.getByRole('img', { name: 'Nu Empresas' })).toHaveAttribute(
      'data-bank-logo',
      'nubank',
    )
    // The image shows once loaded; until then (and in jsdom) the initials hold the place.
    expect(screen.getByText('NE')).toBeInTheDocument()
  })

  it('falls back to initials in the institution color for an unknown bank', () => {
    render(<BankLogo name="Vale Alimentação" size="sm" />)
    expect(screen.getByRole('img', { name: 'Vale Alimentação' })).toHaveAttribute(
      'data-bank-logo',
      'initials',
    )
    expect(screen.getByText('VA')).toHaveClass('text-[10px]')
  })
})
