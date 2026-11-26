import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusDot } from './status-dot'

describe('StatusDot', () => {
  it('is an image named by its label, colored by its tone', () => {
    render(<StatusDot tone="success" label="Conexão ok" />)
    const dot = screen.getByRole('img', { name: 'Conexão ok' })
    expect(dot).toHaveAttribute('data-tone', 'success')
    expect(dot).not.toHaveAttribute('data-pulse')
  })

  it('pulses while something is in progress', () => {
    render(<StatusDot tone="warning" label="Atualizando" pulse />)
    const dot = screen.getByRole('img', { name: 'Atualizando' })
    expect(dot).toHaveAttribute('data-pulse', 'true')
  })
})
