import { describe, expect, it } from 'vitest'
import { makeEntry, salarySplit } from './fixtures'
import { monthRange } from './month'
import { projectMonths } from './projection'
import {
  activeFilters,
  EMPTY_SEARCH_QUERY,
  landingBounds,
  landingDay,
  ledgerSpan,
  parseSearchQuery,
  pickerRange,
  searchAccountIds,
  searchOccurrences,
  searchTotals,
  searchWindow,
  serializeSearchQuery,
  type SearchContext,
  type SearchQuery,
} from './search'

const ctx: SearchContext = {
  pots: [
    { key: 'comfort', name: 'Conforto', color: 'orange', goal: 'limit', sort: 1, archived: false },
  ],
  banks: [
    { id: 'btg', name: 'BTG' },
    { id: 'nu', name: 'Nubank' },
  ],
  accounts: [
    { id: 'cc', bankId: 'btg', name: 'Conta', type: 'checking' },
    { id: 'nucc', bankId: 'nu', name: 'Conta', type: 'checking' },
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
  amountCents: -26000,
  accountId: 'cc',
  categoryId: 'cat-power',
  startMonth: '2026-12',
})
const net = makeEntry({
  id: 'net',
  description: 'Internet',
  amountCents: -12000,
  accountId: 'nucc',
  categoryId: 'cat-net',
  pot: 'comfort',
  startMonth: '2026-12',
})
const transfer = makeEntry({
  id: 'tr',
  kind: 'transfer',
  description: 'Para o Nubank',
  amountCents: -40000,
  accountId: 'cc',
  toAccountId: 'nucc',
  pot: null,
  startMonth: '2026-12',
})
const loose = makeEntry({
  id: 'loose',
  description: 'Avulso',
  amountCents: -5000,
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
})

const base = EMPTY_SEARCH_QUERY

describe('remembered search query (cookie)', () => {
  it('starts with no filter at all', () => {
    expect(parseSearchQuery(undefined)).toEqual(EMPTY_SEARCH_QUERY)
    expect(parseSearchQuery('')).toEqual(EMPTY_SEARCH_QUERY)
    expect(parseSearchQuery('not json')).toEqual(EMPTY_SEARCH_QUERY)
    expect(parseSearchQuery('42')).toEqual(EMPTY_SEARCH_QUERY)
  })

  it('round-trips a query and drops bad fields', () => {
    const query = {
      ...EMPTY_SEARCH_QUERY,
      text: 'luz',
      from: '2027-01-05',
      to: '2027-03-31',
      status: 'paid' as const,
      money: 'available' as const,
    }
    expect(JSON.parse(serializeSearchQuery(query))).toEqual({
      text: 'luz',
      from: '2027-01-05',
      to: '2027-03-31',
      status: 'paid',
      money: 'available',
    })
    expect(parseSearchQuery(serializeSearchQuery(query))).toEqual(query)
    expect(
      parseSearchQuery(JSON.stringify({ pot: 'No pe!', from: '2027-13-01', kind: 'expense' })),
    ).toEqual({ ...EMPTY_SEARCH_QUERY, kind: 'expense' })
    expect(parseSearchQuery(JSON.stringify({ from: '2027-05-10', to: '2027-01-01' })).to).toBe(
      '2027-05-10',
    )
  })
})

describe('ledgerSpan', () => {
  it('covers the first entry to the last landing, open series up to a horizon', () => {
    expect(ledgerSpan([], '2026-12')).toEqual({ from: '2026-12', to: '2026-12' })
    const once = makeEntry({ id: 'a', startMonth: '2025-03', recurrence: 'none' })
    const parcels = makeEntry({
      id: 'b',
      startMonth: '2026-10',
      recurrence: 'installments',
      installments: 24,
    })
    const ended = makeEntry({ id: 'c', recurrence: 'monthly', endMonth: '2030-01' })
    const open = makeEntry({ id: 'd', recurrence: 'yearly', startMonth: '2026-01' })
    expect(ledgerSpan([once], '2026-12')).toEqual({ from: '2025-03', to: '2026-12' })
    expect(ledgerSpan([once, parcels], '2026-12')).toEqual({ from: '2025-03', to: '2028-10' })
    expect(ledgerSpan([ended], '2026-12').to).toBe('2030-02')
    expect(ledgerSpan([open], '2026-12')).toEqual({ from: '2026-01', to: '2027-12' })
    const farOpen = makeEntry({ id: 'e', recurrence: 'monthly', startMonth: '2030-06' })
    expect(ledgerSpan([farOpen], '2026-12').to).toBe('2030-06')
  })

  it('stretches to any chosen day, past or future', () => {
    const span = { from: '2025-03', to: '2027-12' }
    expect(searchWindow(span, { from: '', to: '' })).toEqual(span)
    expect(searchWindow(span, { from: '2026-01-10', to: '2026-02-01' })).toEqual(span)
    expect(searchWindow(span, { from: '2020-01-01', to: '' }).from).toBe('2020-01')
    expect(searchWindow(span, { from: '', to: '2030-06-30' }).to).toBe('2030-06')
    expect(searchWindow(span, { from: '2030-01-01', to: '' }).to).toBe('2031-01')
  })

  it('finds the first and last day with an occurrence', () => {
    expect(landingBounds(months, { from: '2026-12', to: '2027-02' })).toEqual({
      first: '2026-12-15',
      last: '2027-02-20',
    })
    expect(landingBounds(months, { from: '2030-01', to: '2030-12' })).toBeNull()
  })

  it('offers only the years with occurrences in the pickers', () => {
    expect(pickerRange({ first: '2025-03-05', last: '2030-06-01' }, '2026-12-15')).toEqual({
      min: '2025-01-01',
      max: '2030-12-31',
    })
    expect(pickerRange(null, '2026-12-15')).toEqual({ min: '2026-01-01', max: '2026-12-31' })
  })

  it('labels the period chip', () => {
    const period = (from: string, to: string) =>
      activeFilters({ ...EMPTY_SEARCH_QUERY, from, to }, ctx)[0]?.label
    expect(period('2027-01-05', '')).toBe('Desde 05/01/27')
    expect(period('', '2027-01-05')).toBe('Até 05/01/27')
    expect(period('2027-01-05', '2027-01-05')).toBe('05/01/27')
    expect(period('2027-01-05', '2027-02-01')).toBe('05/01/27 a 01/02/27')
  })
})

describe('searchOccurrences', () => {
  it('lists occurrences (not series) with signed values', () => {
    const all = searchOccurrences(months, base, ctx)
    // Dec: 1 salary part (advance), power, net, transfer; Jan: 2 salary parts + 3 + loose; Feb: 2 + 3.
    expect(all).toHaveLength(4 + 6 + 5)
    const values = all.map((o) => o.valueCents)
    expect(values.filter((v) => v > 0).reduce((a, b) => a + b, 0)).toBe(400000 + 1000000 + 1000000)
    expect(values.filter((v) => v < 0).reduce((a, b) => a + b, 0)).toBe(-(38000 * 3 + 5000))
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
    expect(count({ from: '2027-02-01', to: '2027-02-28' })).toBe(5)
    expect(count({ from: '2027-02-01' })).toBe(5)
    expect(count({ to: '2026-12-31' })).toBe(4)
  })

  it('sorts oldest first on request, and sums what it lists', () => {
    const asc = searchOccurrences(months, { ...base, sort: 'asc' }, ctx)
    const days = asc.map((o) => landingDay(o.landing))
    expect(days).toEqual([...days].sort())
    expect(activeFilters({ ...base, sort: 'asc' }, ctx)).toEqual([
      { key: 'sort', label: 'Mais antigos primeiro' },
    ])
    expect(searchTotals(asc)).toEqual({
      incomeCents: 2400000,
      expenseCents: -119000,
      netCents: 2400000 - 119000,
    })
  })

  it('filters by day and lists newest first', () => {
    const all = searchOccurrences(months, base, ctx)
    const days = all.map((o) => landingDay(o.landing))
    expect(days).toEqual([...days].sort().reverse())
    const one = searchOccurrences(months, { ...base, from: days[0] ?? '', to: days[0] ?? '' }, ctx)
    expect(one.length).toBeGreaterThan(0)
    expect(one.every((o) => landingDay(o.landing) === days[0])).toBe(true)
  })

  it('filters by paid status (parts are paid separately)', () => {
    const payments = [
      { entryId: 'power', month: '2026-12', partId: null, paidOn: '2026-12-15' },
      { entryId: 'salary', month: '2026-12', partId: 'salary-a', paidOn: '2026-12-20' },
    ]
    const paid = searchOccurrences(months, { ...base, status: 'paid' }, { ...ctx, payments })
    expect(paid.map((o) => [o.landing.entry.id, o.landing.part?.id ?? null])).toEqual([
      ['salary', 'salary-a'],
      ['power', null],
    ])
    expect(
      searchOccurrences(months, { ...base, status: 'unpaid' }, { ...ctx, payments }),
    ).toHaveLength(15 - 2)
    expect(searchOccurrences(months, { ...base, status: 'paid' }, ctx)).toEqual([])
  })

  it('values a transfer inside the filtered accounts', () => {
    const toNubank = searchOccurrences(months, { ...base, kind: 'transfer', account: 'nucc' }, ctx)
    expect(toNubank.every((o) => o.valueCents === 40000)).toBe(true)
    const unfiltered = searchOccurrences(months, { ...base, kind: 'transfer' }, ctx)
    expect(unfiltered.every((o) => o.valueCents === 0)).toBe(true)
  })
})

describe('searchOccurrences by money bucket', () => {
  const bucketCtx: SearchContext = {
    ...ctx,
    accounts: [
      { id: 'cc', bankId: 'btg', name: 'Conta', type: 'checking' },
      { id: 'va', bankId: 'btg', name: 'VA', type: 'benefit' },
    ],
  }
  const bucketMonths = projectMonths({
    entries: [
      makeEntry({ id: 'rent', description: 'Aluguel', amountCents: -200000, accountId: 'cc' }),
      makeEntry({ id: 'voucher', kind: 'income', pot: null, accountId: 'va', amountCents: 90000 }),
      makeEntry({ id: 'market', description: 'Mercado', accountId: 'va', amountCents: -30000 }),
      makeEntry({
        id: 'top-up',
        kind: 'transfer',
        pot: null,
        accountId: 'cc',
        toAccountId: 'va',
        amountCents: -10000,
      }),
    ],
    parts: [],
    overrides: [],
    accounts: [
      { id: 'cc', openingBalanceCents: 0 },
      { id: 'va', openingBalanceCents: 0 },
    ],
    months: ['2026-12'],
  })
  const query = EMPTY_SEARCH_QUERY
  const run = (money: SearchQuery['money'], account = '') =>
    searchOccurrences(bucketMonths, { ...query, money, account }, bucketCtx).map((o) => [
      o.landing.entry.id,
      o.valueCents,
    ])

  it('lists everything with Tudo, benefit spending included in category totals', () => {
    expect(run('')).toEqual([
      ['voucher', 90000],
      ['rent', -200000],
      ['market', -30000],
      ['top-up', 0],
    ])
  })

  it('narrows to a bucket and values cross-bucket transfers inside it', () => {
    expect(run('available')).toEqual([
      ['rent', -200000],
      ['top-up', -10000],
    ])
    expect(run('benefit')).toEqual([
      ['voucher', 90000],
      ['market', -30000],
      ['top-up', 10000],
    ])
  })

  it('intersects the bucket with the account filter', () => {
    expect(searchAccountIds({ account: 'b:btg', money: 'benefit' }, bucketCtx.accounts)).toEqual([
      'va',
    ])
    expect(searchAccountIds({ account: '', money: '' }, bucketCtx.accounts)).toBeNull()
    expect(run('available', 'va')).toEqual([])
  })

  it('shows the bucket as a filter chip', () => {
    expect(activeFilters({ ...query, money: 'benefit' }, bucketCtx)).toEqual([
      { key: 'money', label: 'Benefícios' },
    ])
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
        status: 'paid',
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
      'Pagos',
    ])
    const more = activeFilters({ ...base, account: 'cc', category: 'cat-net' }, ctx)
    expect(more.map((c) => c.label)).toEqual(['BTG · Conta', 'Internet'])
    expect(
      activeFilters({ ...base, account: 'b:x', category: 'x' }, ctx).map((c) => c.label),
    ).toEqual(['–', '–'])
  })
})
