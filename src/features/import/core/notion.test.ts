import { describe, expect, it } from 'vitest'
import { page, prop } from './fixtures'
import {
  checkboxOf,
  dateOf,
  isNotionPage,
  multiSelectOf,
  numberOf,
  relationOf,
  selectOf,
  textOf,
} from './notion'

describe('notion property accessors', () => {
  const p = page('p', {
    Name: prop.title('Conta'),
    Note: { type: 'rich_text', rich_text: [{ plain_text: 'a' }, { plain_text: 'b' }] },
    Amount: prop.number(1.5),
    Status: prop.select('Active'),
    Tags: prop.multi('x', 'y'),
    Bank: prop.relation('b-1'),
    Due: prop.date('2026-01-02'),
    Done: prop.checkbox(true),
    Broken: { type: 'number', number: Number.NaN },
  })

  it('reads each property type', () => {
    expect(textOf(p, 'Name')).toBe('Conta')
    expect(textOf(p, 'Note')).toBe('ab')
    expect(numberOf(p, 'Amount')).toBe(1.5)
    expect(selectOf(p, 'Status')).toBe('Active')
    expect(multiSelectOf(p, 'Tags')).toEqual(['x', 'y'])
    expect(relationOf(p, 'Bank')).toEqual(['b-1'])
    expect(dateOf(p, 'Due')).toBe('2026-01-02')
    expect(checkboxOf(p, 'Done')).toBe(true)
  })

  it('returns empty values for missing or mistyped properties', () => {
    expect(textOf(p, 'Amount')).toBe('')
    expect(textOf(p, 'Missing')).toBe('')
    expect(numberOf(p, 'Broken')).toBeNull()
    expect(numberOf(p, 'Name')).toBeNull()
    expect(selectOf(p, 'Missing')).toBeNull()
    expect(multiSelectOf(p, 'Missing')).toEqual([])
    expect(relationOf(p, 'Name')).toEqual([])
    expect(dateOf(p, 'Missing')).toBeNull()
    expect(checkboxOf(p, 'Missing')).toBe(false)
  })

  it('recognizes pages', () => {
    expect(isNotionPage(p)).toBe(true)
    expect(isNotionPage({ id: 'x' })).toBe(false)
    expect(isNotionPage(null)).toBe(false)
    expect(isNotionPage([])).toBe(false)
  })
})
