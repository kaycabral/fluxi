import { describe, expect, it } from 'vitest'
import {
  centsToInput,
  formatCompactMoney,
  formatMoney,
  formatPercent,
  formatSignedMoney,
  isoDate,
  isoDayOf,
  monthLabel,
  monthLongLabel,
  monthOf,
  parseMoneyInput,
  shortDate,
} from './format'

describe('format', () => {
  it('labels months', () => {
    expect(monthLabel('2026-12')).toBe('dez/26')
    expect(monthLabel('2027-01')).toBe('jan/27')
    expect(monthLongLabel('2027-03')).toBe('março de 2027')
  })

  it('formats whole reais with sign', () => {
    expect(formatMoney(123456)).toBe('R$ 1.235')
    expect(formatMoney(-245000)).toBe('-R$ 2.450')
    expect(formatMoney(-20)).toBe('R$ 0')
    expect(formatSignedMoney(1000)).toBe('+R$ 10')
    expect(formatSignedMoney(-1000)).toBe('-R$ 10')
    expect(formatSignedMoney(0)).toBe('R$ 0')
  })

  it('compacts money for dense grids', () => {
    expect(formatCompactMoney(960000)).toBe('9,6k')
    expect(formatCompactMoney(1060000)).toBe('11k')
    expect(formatCompactMoney(-2450000)).toBe('-25k')
    expect(formatCompactMoney(26000)).toBe('260')
    expect(formatCompactMoney(-26000)).toBe('-260')
    expect(formatCompactMoney(10)).toBe('0')
  })

  it('formats percentages', () => {
    expect(formatPercent(0.325)).toBe('32,5%')
    expect(formatPercent(0)).toBe('0%')
  })

  it('round-trips the money input', () => {
    expect(centsToInput(0)).toBe('')
    expect(centsToInput(123456)).toBe('1234,56')
    expect(parseMoneyInput('1234,56')).toBe(123456)
    expect(parseMoneyInput('1.234,56')).toBe(123456)
    expect(parseMoneyInput('1234.56')).toBe(123456)
    expect(parseMoneyInput('1.234')).toBe(123400)
    expect(parseMoneyInput('R$ 50')).toBe(5000)
    expect(parseMoneyInput('')).toBeNull()
    expect(parseMoneyInput('abc')).toBeNull()
  })

  it('builds dates', () => {
    expect(isoDate('2027-02', 31)).toBe('2027-02-28')
    expect(isoDate('2027-02', 0)).toBe('2027-02-01')
    expect(shortDate('2026-12', 5)).toBe('05/12/26')
  })

  it('reads the month in São Paulo', () => {
    const lateUtc = new Date('2026-12-01T02:00:00Z')
    expect(monthOf(lateUtc)).toBe('2026-11')
    expect(isoDayOf(lateUtc, 'UTC')).toBe('2026-12-01')
  })
})
