import { formatAmountFromCents, maskBRLInput, parseBRLInput } from '@cbrl/br/money'
import { describe, expect, it } from 'vitest'
import {
  centsToInput,
  dayLongLabel,
  dueDateLabel,
  formatMoney,
  formatPercent,
  formatSignedMoney,
  isoDate,
  isoDayOf,
  moneyInputDisplay,
  monthLabel,
  monthLongLabel,
  monthOf,
  parseSignedMoneyInput,
  shortDate,
  signedCentsToInput,
} from './format'

describe('format', () => {
  it('labels months', () => {
    expect(monthLabel('2026-12')).toBe('dez/26')
    expect(monthLabel('2027-01')).toBe('jan/27')
    expect(monthLongLabel('2027-03')).toBe('março de 2027')
    // Out-of-range months degrade instead of throwing.
    expect(monthLabel('2026-13')).toBe('/26')
    expect(monthLongLabel('2026-13')).toBe(' de 2026')
  })

  it('formats money with cents and sign', () => {
    expect(formatMoney(123456)).toBe('R$ 1.234,56')
    expect(formatMoney(-245000)).toBe('-R$ 2.450,00')
    expect(formatMoney(-20)).toBe('-R$ 0,20')
    expect(formatMoney(0)).toBe('R$ 0,00')
    expect(formatSignedMoney(1000)).toBe('+R$ 10,00')
    expect(formatSignedMoney(5)).toBe('+R$ 0,05')
    expect(formatSignedMoney(-1000)).toBe('-R$ 10,00')
    expect(formatSignedMoney(0)).toBe('R$ 0,00')
  })

  it('formats amounts for dense grids without the symbol, keeping the cents', () => {
    expect(formatAmountFromCents(1060000)).toBe('10.600,00')
    expect(formatAmountFromCents(-2450050)).toBe('-24.500,50')
    expect(formatAmountFromCents(26000)).toBe('260,00')
    expect(formatAmountFromCents(10)).toBe('0,10')
  })

  it('formats percentages', () => {
    expect(formatPercent(0.325)).toBe('32,5%')
    expect(formatPercent(0)).toBe('0%')
  })

  it('round-trips the money input', () => {
    expect(centsToInput(0)).toBe('')
    expect(centsToInput(123456)).toBe('1234,56')
    expect(parseBRLInput('1234,56')).toBe(123456)
    expect(parseBRLInput('1.234,56')).toBe(123456)
    expect(parseBRLInput('1234.56')).toBe(123456)
    expect(parseBRLInput('1.234')).toBe(123400)
    expect(parseBRLInput('R$ 50')).toBe(5000)
    expect(parseBRLInput('')).toBeNull()
    expect(parseBRLInput('abc')).toBeNull()
  })

  it('handles signed money', () => {
    expect(parseSignedMoneyInput('-10,50')).toBe(-1050)
    expect(parseSignedMoneyInput('10')).toBe(1000)
    expect(parseSignedMoneyInput('-x')).toBeNull()
    expect(signedCentsToInput(-1050)).toBe('-10,50')
    expect(signedCentsToInput(0)).toBe('0')
    expect(signedCentsToInput(640000)).toBe('6400,00')
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

describe('maskBRLInput', () => {
  it('shifts digits in from the cents side', () => {
    expect(maskBRLInput('5')).toBe('0,05')
    expect(maskBRLInput('1234')).toBe('12,34')
    expect(maskBRLInput('123456')).toBe('1.234,56')
    expect(maskBRLInput('1.234,567')).toBe('12.345,67')
  })

  it('re-masks values coming from the form and reads back as cents', () => {
    expect(maskBRLInput('1234,56')).toBe('1.234,56')
    expect(parseBRLInput(maskBRLInput('123456'))).toBe(123456)
  })

  it('empties on zero so erasing digit by digit clears the field', () => {
    expect(maskBRLInput('')).toBe('')
    expect(maskBRLInput('R$ abc')).toBe('')
    expect(maskBRLInput('0')).toBe('')
    expect(maskBRLInput('0,0')).toBe('')
    expect(maskBRLInput('0,05')).toBe('0,05')
  })

  it('drops digits past R$ 99 bilhões', () => {
    expect(maskBRLInput('99999999999999999')).toBe('99.999.999.999,99')
  })
})

describe('moneyInputDisplay', () => {
  it('shows the amount the value saves', () => {
    expect(moneyInputDisplay('50')).toBe('50,00')
    expect(moneyInputDisplay('1234,56')).toBe('1.234,56')
    expect(moneyInputDisplay('0,05')).toBe('0,05')
    expect(moneyInputDisplay('')).toBe('')
    expect(moneyInputDisplay('0')).toBe('')
  })
})

describe('dayLongLabel', () => {
  it('names the weekday, day and month', () => {
    expect(dayLongLabel('2026-12-03')).toBe('quinta-feira, 3 de dezembro')
    expect(dayLongLabel('2027-01-31')).toBe('domingo, 31 de janeiro')
  })
})

describe('dueDateLabel', () => {
  it('omits the year only in the current year', () => {
    expect(dueDateLabel('2026-12-19', '2026-11-27')).toBe('19/12')
    expect(dueDateLabel('2025-12-19', '2026-11-27')).toBe('19/12/25')
    expect(dueDateLabel('2027-01-05', '2026-11-27')).toBe('05/01/27')
  })
})
