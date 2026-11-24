import { describe, expect, it } from 'vitest'
import { addMonths, daysInMonth, diffMonths, monthFromDate, monthRange, monthToDate } from './month'

describe('month arithmetic', () => {
  it('adds months across year boundaries in both directions', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2027-01', -1)).toBe('2026-12')
    expect(addMonths('2026-09', 28)).toBe('2029-01')
    expect(addMonths('2026-03', -15)).toBe('2024-12')
    expect(addMonths('2026-05', 0)).toBe('2026-05')
  })

  it('diffs months, negative when the target is earlier', () => {
    expect(diffMonths('2026-09', '2027-09')).toBe(12)
    expect(diffMonths('2027-02', '2026-12')).toBe(-2)
  })

  it('knows month lengths, leap years included', () => {
    expect(daysInMonth('2027-02')).toBe(28)
    expect(daysInMonth('2028-02')).toBe(29)
    expect(daysInMonth('2026-04')).toBe(30)
    expect(daysInMonth('2026-12')).toBe(31)
  })

  it('builds inclusive ranges', () => {
    expect(monthRange('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02'])
    expect(monthRange('2027-02', '2026-11')).toEqual([])
  })

  it('converts to and from Postgres dates', () => {
    expect(monthFromDate('2026-12-01')).toBe('2026-12')
    expect(monthToDate('2026-12')).toBe('2026-12-01')
  })

  it('rejects malformed months', () => {
    expect(() => addMonths('2026-13', 1)).toThrow(RangeError)
    expect(() => monthFromDate('12/2026')).toThrow('invalid month')
    expect(() => monthToDate('2026-1')).toThrow(RangeError)
  })
})
