import { describe, expect, it } from 'vitest'
import { makeEntry, salarySplit } from './fixtures'
import { monthRange } from './month'
import { projectMonths } from './projection'
import {
  activeFilters,
  defaultSearchQuery,
  drillDown,
  groupOccurrences,
  parseSearchQuery,
  searchOccurrences,
  searchQueryToParams,
  searchTotals,
  type GroupKey,
  type SearchContext,
} from './search'

const ctx: SearchContext = {
  banks: [
    { id: 'btg', name: 'BTG' },
    { id: 'nu', name: 'Nubank' },
  ],
  accounts: [
    { id: 'cc', bankId: 'btg', name: 'Conta' },
    { id: 'nucc', bankId: 'nu', name: 'Conta' },
  ],
  categories: [
    { id: 'cat-salary', groupName: 'Renda', name: 'Salário' },
    { id: 'cat-power', groupName: 'Contas', name: 'Energia elétrica' },
    { id: 'cat-net', groupName: 'Contas', name: 'Internet' },
  ],
}

const salary = makeEntry({
  id: 'salary',
  kind: 'income',
  description: 'Salário',
  amountCents: 1000000,
  accountId: 'cc',
  categoryId: 'cat-salary',
  pot: null,
  startMonth: '2026-12',
  tags: ['trabalho'],
})
const power = makeEntry({
  id: 'power',
  description: 'Luz',
  amountCents: 26000,
  accountId: 'cc',
  categoryId: 'cat-power',
  startMonth: '2026-12',
})
const net = makeEntry({
  id: 'net',
  description: 'Internet',
  amountCents: 12000,
  accountId: 'nucc',
  categoryId: 'cat-net',
  pot: 'comfort',
  startMonth: '2026-12',
})
const transfer = makeEntry({
  id: 'tr',
  kind: 'transfer',
  description: 'Para o Nubank',
  amountCents: 40000,
  accountId: 'cc',
  toAccountId: 'nucc',
  pot: null,
  startMonth: '2026-12',
})
const loose = makeEntry({
  id: 'loose',
  description: 'Avulso',
  amountCents: 5000,
  accountId: 'cc',
  pot: null,
  recurrence: 'none',
  startMonth: '2027-01',
})

const months = projectMonths({
  entries: [salary, power, net, transfer, loose],
  parts: salarySplit('salary'),
  overrides: [],
  accounts: [
    { id: 'cc', openingBalanceCents: 0 },
    { id: 'nucc', openingBalanceCents: 0 },
  ],
  months: monthRange('2026-12', '2027-02'),
  countFrom: '2026-12',
})

const base = { ...defaultSearchQuery('2026-12'), to: '2027-02', group: 'none' as const }

describe('search query in the URL', () => {
  it('parses params with defaults and fallbacks', () => {
    expect(parseSearchQuery({}, '2026-12')).toEqual(defaultSearchQuery('2026-12'))
    const q = parseSearchQuery(
      { q: 'luz', de: '2027-01', tipo: 'expense', pote: 'nope', agrupar: ['category'], tag: 'x' },
      '2026-12',
    )
    expect(q).toMatchObject({
      text: 'luz',
      from: '2027-01',
      to: '2027-12',
      kind: 'expense',
      pot: '',
      group: 'category',
      tag: 'x',
    })
    expect(parseSearchQuery({ de: '2027-05', ate: '2027-01' }, '2026-12').to).toBe('2027-05')
    expect(parseSearchQuery({ de: 'bad' }, '2026-12').from).toBe('2026-12')
  })

  it('serializes only what differs from the defaults', () => {
    expect(searchQueryToParams(defaultSearchQuery('2026-12'), '2026-12')).toBe('')
    const params = new URLSearchParams(
      searchQueryToParams(
        { ...defaultSearchQuery('2026-12'), text: 'luz', to: '2027-03' },
        '2026-12',
      ),
    )
    expect(params.get('q')).toBe('luz')
    expect(params.get('de')).toBe('2026-12')
    expect(params.get('ate')).toBe('2027-03')
    expect(parseSearchQuery(Object.fromEntries(params), '2026-12')).toMatchObject({
      text: 'luz',
      to: '2027-03',
    })
  })
})

describe('searchOccurrences', () => {
  it('lists occurrences (not series) with signed values', () => {
    const all = searchOccurrences(months, base, ctx)
    // Dec: 1 salary part (advance), power, net, transfer; Jan: 2 salary parts + 3 + loose; Feb: 2 + 3.
    expect(all).toHaveLength(4 + 6 + 5)
    const totals = searchTotals(all, base)
    expect(totals.count).toBe(15)
    expect(totals.incomeCents).toBe(400000 + 1000000 + 1000000)
    expect(totals.expenseCents).toBe(-(38000 * 3 + 5000))
    expect(totals.totalCents).toBe(totals.incomeCents + totals.expenseCents)
    expect(totals.monthlyAverageCents).toBe(Math.round(totals.totalCents / 3))
  })

  it('filters by text, kind, account, category, pot and tag', () => {
    const count = (q: Partial<typeof base>) =>
      searchOccurrences(months, { ...base, ...q }, ctx).length
    expect(count({ text: 'LUZ' })).toBe(3)
    expect(count({ kind: 'transfer' })).toBe(3)
    expect(count({ account: 'nucc' })).toBe(6)
    expect(count({ account: 'b:btg' })).toBe(12)
    expect(count({ category: 'g:Contas' })).toBe(6)
    expect(count({ category: 'cat-net' })).toBe(3)
    expect(count({ pot: 'comfort' })).toBe(3)
    expect(count({ tag: 'trabalho' })).toBe(5)
    expect(count({ from: '2027-02', to: '2027-02' })).toBe(5)
  })

  it('values a transfer inside the filtered accounts', () => {
    const toNubank = searchOccurrences(months, { ...base, kind: 'transfer', account: 'nucc' }, ctx)
    expect(toNubank.every((o) => o.valueCents === 40000)).toBe(true)
    const unfiltered = searchOccurrences(months, { ...base, kind: 'transfer' }, ctx)
    expect(unfiltered.every((o) => o.valueCents === 0)).toBe(true)
  })
})

describe('grouping', () => {
  const all = searchOccurrences(months, base, ctx)
  const labels = (group: GroupKey) => groupOccurrences(all, group, ctx).map((g) => g.label)

  it('groups by every key', () => {
    expect(labels('month')).toEqual(['2026-12', '2027-01', '2027-02'])
    expect(labels('year')).toEqual(['2026', '2027'])
    expect(labels('group')).toEqual(['Renda', 'Contas', 'Sem categoria', 'Transferências'])
    expect(labels('category')[0]).toBe('Salário')
    expect(labels('category')).toContain('Transferência')
    expect(labels('account')).toEqual(['BTG · Conta', 'Nubank · Conta'])
    expect(labels('bank')).toEqual(['BTG', 'Nubank'])
    expect(labels('pot')).toEqual(['Sem pote', 'Essencial', 'Conforto'])
    expect(labels('description')[0]).toBe('Salário')
    const months2 = groupOccurrences(all, 'month', ctx)
    expect(months2.reduce((s, g) => s + g.count, 0)).toBe(all.length)
  })

  it('drills down into a group', () => {
    expect(drillDown(base, 'month', '2027-01')).toMatchObject({
      from: '2027-01',
      to: '2027-01',
      group: 'none',
    })
    expect(drillDown(base, 'year', '2027')).toMatchObject({ from: '2027-01', to: '2027-02' })
    expect(drillDown(base, 'year', '2026')).toMatchObject({ from: '2026-12', to: '2026-12' })
    expect(drillDown(base, 'group', 'Contas').category).toBe('g:Contas')
    expect(drillDown(base, 'group', '').category).toBe('')
    expect(drillDown(base, 'category', 'cat-net').category).toBe('cat-net')
    expect(drillDown(base, 'account', 'nucc').account).toBe('nucc')
    expect(drillDown(base, 'bank', 'nu').account).toBe('b:nu')
    expect(drillDown(base, 'bank', '').account).toBe('')
    expect(drillDown(base, 'pot', 'comfort').pot).toBe('comfort')
    expect(drillDown(base, 'pot', '').pot).toBe('')
    expect(drillDown(base, 'description', 'Luz').text).toBe('Luz')
  })
})

describe('activeFilters', () => {
  it('describes the filters in use', () => {
    expect(activeFilters(base, ctx)).toEqual([])
    const chips = activeFilters(
      {
        ...base,
        text: 'luz',
        kind: 'income',
        account: 'b:nu',
        category: 'g:Contas',
        pot: 'comfort',
        tag: 'x',
      },
      ctx,
    )
    expect(chips.map((c) => c.label)).toEqual([
      '"luz"',
      'Entradas',
      'Nubank',
      'Contas',
      'Conforto',
      '#x',
    ])
    const more = activeFilters({ ...base, account: 'cc', category: 'cat-net' }, ctx)
    expect(more.map((c) => c.label)).toEqual(['BTG · Conta', 'Internet'])
    expect(
      activeFilters({ ...base, account: 'b:x', category: 'x' }, ctx).map((c) => c.label),
    ).toEqual(['–', '–'])
  })
})
