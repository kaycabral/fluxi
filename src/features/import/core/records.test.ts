import { describe, expect, it } from 'vitest'
import { monthPage, page, prop, txPage } from './fixtures'
import { buildMonthIndex, stripEmoji, toRecords } from './records'

const index = buildMonthIndex([monthPage('2026-03')], [])

describe('buildMonthIndex', () => {
  it('uses the Duration start, else the year relation with the English month name', () => {
    const years = [page('y-1', { Name: prop.title('2027') })]
    const months = [
      monthPage('2026-03'),
      page('m-b', {
        Name: prop.title('February'),
        Year: prop.relation('y-1'),
        Duration: prop.date(null),
      }),
      page('m-c', { Name: prop.title('Fevereiro'), Year: prop.relation('y-1') }),
    ]
    const map = buildMonthIndex(months, years)
    expect(map.get('m-2026-03')).toBe('2026-03')
    expect(map.get('m-b')).toBe('2027-02')
    expect(map.has('m-c')).toBe(false)
  })
})

describe('stripEmoji', () => {
  it('drops the emoji prefix of a category group', () => {
    expect(stripEmoji('🛒 Mercado')).toBe('Mercado')
    expect(stripEmoji('🛍️  Compras')).toBe('Compras')
    expect(stripEmoji('Saúde')).toBe('Saúde')
  })
})

describe('toRecords', () => {
  it('counts ignored, incomplete and month-less rows without importing them', () => {
    const result = toRecords(
      [
        txPage('a', { ignored: true, month: 'm-2026-03' }),
        txPage('b', { amount: null, month: 'm-2026-03' }),
        txPage('c', { movement: null, month: 'm-2026-03' }),
        txPage('d', { month: null }),
        txPage('e', { month: 'm-2026-03' }),
      ],
      index,
    )
    expect(result.skipped).toEqual({ ignored: 1, incomplete: 2, noMonth: 1 })
    expect(result.records.map((r) => r.externalId)).toEqual(['e'])
  })

  it('maps month from the relation, else Due/Date, and day from Due, else Date, else 1', () => {
    const { records } = toRecords(
      [
        txPage('a', { month: 'm-2026-03', due: '2026-04-07' }),
        txPage('b', { due: '2026-05-20' }),
        txPage('c', { date: '2026-06-02T10:00:00.000-03:00' }),
        txPage('d', { month: 'm-2026-03' }),
      ],
      index,
    )
    expect(records.map((r) => [r.month, r.day])).toEqual([
      ['2026-03', 7],
      ['2026-05', 20],
      ['2026-06', 2],
      ['2026-03', 1],
    ])
    expect(records[2]?.paidOn).toBe('2026-06-02')
  })

  it('rounds to cents and flips the movement of a negative amount', () => {
    const result = toRecords(
      [
        txPage('a', { month: 'm-2026-03', amount: -569.1 }),
        txPage('b', { month: 'm-2026-03', amount: 12.345 }),
      ],
      index,
    )
    expect(result.negativeFlipped).toBe(1)
    expect(result.records.map((r) => [r.amountCents, r.movement])).toEqual([
      [56910, 'Inflow'],
      [1235, 'Outflow'],
    ])
  })

  it('splits the category into group (emoji stripped) and sub-category, sorts tags and keys the description', () => {
    const [r] = toRecords(
      [
        txPage('a', {
          month: 'm-2026-03',
          description: '  Super   Mercado ',
          category: ['Supermercado e mercearia', '🛒 Mercado'],
          tags: ['b', 'a'],
          type: 'Essential',
        }),
      ],
      index,
    ).records
    expect(r).toMatchObject({
      group: 'Mercado',
      subCategory: 'Supermercado e mercearia',
      tags: ['a', 'b'],
      description: 'Super Mercado',
      descriptionKey: 'super mercado',
      type: 'Essential',
    })
  })
})
