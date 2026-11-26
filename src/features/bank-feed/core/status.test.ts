import { describe, expect, it } from 'vitest'
import { brDate, feedAccountStatusLine, lastMovementLabel } from './status'

describe('feed account status', () => {
  it('formats the latest movement as dd/mm/aaaa, or says there was none', () => {
    expect(brDate('2026-11-03')).toBe('03/11/2026')
    expect(lastMovementLabel('2026-11-03')).toBe('Último movimento: 03/11/2026')
    expect(lastMovementLabel(null)).toBe('Sem movimento nos últimos 12 meses')
  })

  it('puts a known card status first', () => {
    expect(feedAccountStatusLine({ lastMovement: '2026-10-31', cardStatus: 'cancelled' })).toBe(
      'Cartão cancelado · Último movimento: 31/10/2026',
    )
    expect(feedAccountStatusLine({ lastMovement: null, cardStatus: null })).toBe(
      'Sem movimento nos últimos 12 meses',
    )
  })
})
