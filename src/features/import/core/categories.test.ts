import { describe, expect, it } from 'vitest'
import {
  categoryKey,
  categoryKeyOf,
  planCategories,
  potOfEntry,
  potOfType,
  UNGROUPED,
} from './categories'
import { item } from './fixtures'
import { groupIntoEntries } from './grouping'

describe('potOfType', () => {
  it('maps every Notion type and nothing else', () => {
    expect(
      ['Essential', 'Comfort', 'Guilt Free', 'Educacional', 'Variable', 'Investment'].map(
        potOfType,
      ),
    ).toEqual(['essential', 'comfort', 'guilt_free', 'education', 'variable', 'investment'])
    expect(potOfType(null)).toBeNull()
    expect(potOfType('Other')).toBeNull()
  })

  it('gives a pot to expenses only', () => {
    expect(potOfEntry({ kind: 'expense', type: 'Comfort' })).toBe('comfort')
    expect(potOfEntry({ kind: 'income', type: 'Comfort' })).toBeNull()
    expect(potOfEntry({ kind: 'transfer', type: 'Comfort' })).toBeNull()
  })
})

describe('planCategories', () => {
  it('keys categories by group and name with the pot most used among expense occurrences', () => {
    const { entries } = groupIntoEntries([
      item({ month: '2026-01', type: 'Variable', descriptionKey: 'a' }),
      item({ month: '2026-01', type: 'Essential', descriptionKey: 'b' }),
      item({ month: '2026-02', type: 'Essential', descriptionKey: 'b' }),
      item({
        month: '2026-01',
        kind: 'income',
        type: 'Comfort',
        subCategory: 'Salário',
        group: 'Renda',
      }),
      item({ month: '2026-01', group: null, subCategory: 'Solta', descriptionKey: 'c' }),
      item({ month: '2026-01', subCategory: null, descriptionKey: 'd' }),
    ])
    expect(planCategories(entries)).toEqual([
      {
        key: categoryKey('Moradia', 'Pagamento de aluguel'),
        groupName: 'Moradia',
        name: 'Pagamento de aluguel',
        defaultPot: 'essential',
      },
      {
        key: categoryKey('Renda', 'Salário'),
        groupName: 'Renda',
        name: 'Salário',
        defaultPot: null,
      },
      {
        key: categoryKey(UNGROUPED, 'Solta'),
        groupName: UNGROUPED,
        name: 'Solta',
        defaultPot: 'essential',
      },
    ])
  })

  it('gives transfers no category', () => {
    const [entry] = groupIntoEntries([item({ kind: 'transfer', toAccountId: 'acc-2' })]).entries
    expect(entry === undefined ? 'missing' : categoryKeyOf(entry)).toBeNull()
  })
})
