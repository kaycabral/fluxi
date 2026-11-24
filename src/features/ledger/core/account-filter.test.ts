import { describe, expect, it } from 'vitest'
import {
  accountIdsOf,
  accountLabel,
  bankFilter,
  bankIdOf,
  decisionAccountIds,
  entryMatchesAccounts,
  filterLabel,
} from './account-filter'

const banks = [
  { id: 'btg', name: 'BTG' },
  { id: 'nu', name: 'Nubank' },
]
const accounts = [
  { id: 'cc', bankId: 'btg', name: 'Conta' },
  { id: 'card', bankId: 'btg', name: 'Cartão' },
  { id: 'nucc', bankId: 'nu', name: 'Conta' },
  { id: 'orphan', bankId: 'gone', name: 'Solta' },
]

describe('account filter', () => {
  it('resolves account ids', () => {
    expect(accountIdsOf('', accounts)).toBeNull()
    expect(accountIdsOf(bankFilter('btg'), accounts)).toEqual(['cc', 'card'])
    expect(accountIdsOf('nucc', accounts)).toEqual(['nucc'])
    expect(bankIdOf('nucc')).toBeNull()
  })

  it('covers available money only in decision views, unless a benefit is picked', () => {
    const typed = [
      { id: 'cc', bankId: 'btg', type: 'checking' },
      { id: 'va', bankId: 'btg', type: 'benefit' },
      { id: 'card', bankId: 'nu', type: 'credit' },
      { id: 'vr', bankId: 'flash', type: 'benefit' },
    ] as const
    expect(decisionAccountIds('', typed)).toEqual(['cc', 'card'])
    expect(decisionAccountIds(bankFilter('btg'), typed)).toEqual(['cc'])
    expect(decisionAccountIds(bankFilter('flash'), typed)).toEqual(['vr'])
    expect(decisionAccountIds('va', typed)).toEqual(['va'])
  })

  it('matches entries on either side of a transfer', () => {
    expect(entryMatchesAccounts({ accountId: 'cc', toAccountId: null }, null)).toBe(true)
    expect(entryMatchesAccounts({ accountId: 'cc', toAccountId: 'nucc' }, ['nucc'])).toBe(true)
    expect(entryMatchesAccounts({ accountId: 'cc', toAccountId: null }, ['nucc'])).toBe(false)
  })

  it('labels accounts and filters', () => {
    expect(accountLabel('cc', accounts, banks)).toBe('BTG · Conta')
    expect(accountLabel('orphan', accounts, banks)).toBe('Solta')
    expect(accountLabel('x', accounts, banks)).toBe('–')
    expect(filterLabel('', accounts, banks)).toBe('Todas as contas')
    expect(filterLabel(bankFilter('nu'), accounts, banks)).toBe('Nubank')
    expect(filterLabel(bankFilter('x'), accounts, banks)).toBe('–')
    expect(filterLabel('card', accounts, banks)).toBe('BTG · Cartão')
  })
})
