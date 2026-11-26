import { describe, expect, it } from 'vitest'
import {
  budgetGroupOfEntry,
  budgetGroupOfType,
  categoryKey,
  categoryKeyOf,
  planCategories,
  UNGROUPED,
} from './categories'
import { item } from './fixtures'
import { groupIntoEntries } from './grouping'

describe('budgetGroupOfType', () => {
  it('maps every Notion type and nothing else', () => {
    expect(
      ['Essential', 'Comfort', 'Guilt Free', 'Educacional', 'Variable', 'Investment'].map(
        budgetGroupOfType,
      ),
    ).toEqual(['essential', 'comfort', 'guilt_free', 'education', 'variable', 'investment'])
    expect(budgetGroupOfType(null)).toBeNull()
    expect(budgetGroupOfType('Other')).toBeNull()
  })

  it('gives a budget group to expenses only', () => {
    expect(budgetGroupOfEntry({ kind: 'expense', type: 'Comfort' })).toBe('comfort')
    expect(budgetGroupOfEntry({ kind: 'income', type: 'Comfort' })).toBeNull()
    expect(budgetGroupOfEntry({ kind: 'transfer', type: 'Comfort' })).toBeNull()
  })
})

describe('planCategories', () => {
  it('keys categories by group and name with the budget group most used among expense occurrences', () => {
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
        defaultBudgetGroup: 'essential',
      },
      {
        key: categoryKey('Renda', 'Salário'),
        groupName: 'Renda',
        name: 'Salário',
        defaultBudgetGroup: null,
      },
      {
        key: categoryKey(UNGROUPED, 'Solta'),
        groupName: UNGROUPED,
        name: 'Solta',
        defaultBudgetGroup: 'essential',
      },
    ])
  })

  it('gives transfers no category', () => {
    const [entry] = groupIntoEntries([item({ kind: 'transfer', toAccountId: 'acc-2' })]).entries
    expect(entry === undefined ? 'missing' : categoryKeyOf(entry)).toBeNull()
  })
})
