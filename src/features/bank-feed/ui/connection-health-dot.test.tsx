import type { ConnectionHealth } from '@/features/bank-feed/core/health'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { ConnectionHealthDot, HealthDot, healthLabel } from './connection-health-dot'

const OK: ConnectionHealth = {
  level: 'ok',
  reason: 'Atualizada hoje às 06:02',
  inProgress: false,
  next: 'Próxima atualização: amanhã às 06:00',
}

describe('ConnectionHealthDot', () => {
  it('names the reason and the next update, and shows them on hover', async () => {
    render(<ConnectionHealthDot health={OK} />)
    const trigger = screen.getByRole('button', {
      name: 'Conexão: Atualizada hoje às 06:02. Próxima atualização: amanhã às 06:00',
    })
    expect(trigger).toHaveAttribute('data-level', 'ok')
    await userEvent.hover(trigger)
    expect((await screen.findAllByText('Atualizada hoje às 06:02')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Próxima atualização: amanhã às 06:00').length).toBeGreaterThan(0)
  })

  it('maps levels to tones and pulses while updating', () => {
    render(
      <HealthDot
        health={{ level: 'warn', reason: 'Atualizando agora…', inProgress: true, next: null }}
      />,
    )
    const dot = screen.getByRole('img', { name: 'Conexão: Atualizando agora…' })
    expect(dot).toHaveAttribute('data-tone', 'warning')
    expect(dot).toHaveAttribute('data-pulse', 'true')
  })

  it.each([
    ['error', 'destructive'],
    ['unknown', 'muted'],
  ] as const)('%s → %s', (level, tone) => {
    render(<HealthDot health={{ ...OK, level, next: null }} />)
    expect(screen.getByRole('img')).toHaveAttribute('data-tone', tone)
  })

  it('omits a missing next update from the label', () => {
    expect(healthLabel({ ...OK, next: null })).toBe('Conexão: Atualizada hoje às 06:02')
  })
})
