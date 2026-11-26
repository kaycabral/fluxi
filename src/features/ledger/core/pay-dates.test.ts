import { describe, expect, it } from 'vitest'
import { dayMonth, isPayableDate, payControlLabel, payShortcuts } from './pay-dates'

describe('payShortcuts', () => {
  it('offers yesterday and the day before, across month boundaries', () => {
    expect(payShortcuts('2026-12-01', '2026-12-10')).toEqual([
      { key: 'yesterday', label: 'Ontem', date: '2026-11-30' },
      { key: 'dayBefore', label: 'Anteontem', date: '2026-11-29' },
    ])
  })

  it('adds the due date when it is in the past', () => {
    expect(payShortcuts('2026-11-26', '2026-11-20').at(-1)).toEqual({
      key: 'due',
      label: 'No vencimento',
      date: '2026-11-20',
    })
  })

  it('omits the due date when it is today or in the future', () => {
    expect(payShortcuts('2026-11-26', '2026-11-26').map((s) => s.key)).toEqual([
      'yesterday',
      'dayBefore',
    ])
    expect(payShortcuts('2026-11-26', '2026-12-05').map((s) => s.key)).toEqual([
      'yesterday',
      'dayBefore',
    ])
  })

  it('does not repeat a due date that is yesterday or the day before', () => {
    expect(payShortcuts('2026-11-26', '2026-11-25')).toHaveLength(2)
    expect(payShortcuts('2026-11-26', '2026-11-24')).toHaveLength(2)
  })
})

describe('pay labels and dates', () => {
  it('names the action when unpaid and the state when paid', () => {
    expect(payControlLabel(-100, false)).toBe('Pagar')
    expect(payControlLabel(100, false)).toBe('Receber')
    expect(payControlLabel(-100, true)).toBe('Pago')
    expect(payControlLabel(100, true)).toBe('Recebido')
  })

  it('formats dd/mm and refuses future dates', () => {
    expect(dayMonth('2026-11-05')).toBe('05/11')
    expect(isPayableDate('2026-11-26', '2026-11-26')).toBe(true)
    expect(isPayableDate('2026-11-27', '2026-11-26')).toBe(false)
  })
})
