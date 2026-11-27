import { describe, expect, it } from 'vitest'
import { MONTH_COLUMNS, monthColumnsFor, monthsBeforeFor } from './traffic-light'

describe('monthColumnsFor', () => {
  it('is unknown until the card is measured', () => {
    expect(monthColumnsFor(0)).toBeNull()
    expect(monthColumnsFor(Number.NaN)).toBeNull()
  })

  it('never shows fewer than 2 months (current and next): only then does it scroll', () => {
    expect(monthColumnsFor(200)).toBe(2)
    expect(monthColumnsFor(330)).toBe(2)
    expect(monthColumnsFor(MONTH_COLUMNS.groupWidth + 3 * MONTH_COLUMNS.monthWidth)).toBe(3)
  })

  it('adds one month per ~100px of card', () => {
    expect(monthColumnsFor(660)).toBe(5)
    expect(monthColumnsFor(760)).toBe(6)
    expect(monthColumnsFor(1150)).toBe(10)
  })

  it('stops at a year ahead: wider cards keep 12 months', () => {
    expect(monthColumnsFor(MONTH_COLUMNS.groupWidth + 12 * MONTH_COLUMNS.monthWidth)).toBe(12)
    expect(monthColumnsFor(4000)).toBe(12)
  })
})

describe('monthsBeforeFor', () => {
  it('opens tight cards on the current month and roomier ones one month back', () => {
    expect(monthsBeforeFor(2, 1)).toBe(0)
    expect(monthsBeforeFor(3, 1)).toBe(0)
    expect(monthsBeforeFor(4, 1)).toBe(1)
    expect(monthsBeforeFor(12, 1)).toBe(1)
  })
})
