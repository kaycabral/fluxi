import { describe, expect, it } from 'vitest'
import { accountIdsOf, decisionAccountIds } from './account-filter'
import { budgetMonths } from './budget'
import { calendarMonth } from './calendar'
import { dayCells } from './calendar-views'
import { accountBalancesOn, balanceSnapshot } from './dashboard'
import { makeEntry, makeOverride } from './fixtures'
import { monthRange } from './month'
import { archivedFilter, dailyBalance, projectMonths, type MonthResult } from './projection'
import { parseSearchQuery, searchOccurrences, searchTotals } from './search'

/**
 * An archived account has no influence anywhere: its opening balance, its
 * entries and its side of a transfer. Unarchiving restores everything.
 */

const salary = makeEntry({
  id: 'salary',
  kind: 'income',
  pot: null,
  amountCents: 500000,
  day: 5,
  startMonth: '2026-12',
})
const rent = makeEntry({ id: 'rent', amountCents: -200000, day: 10, startMonth: '2026-12' })
const oldCard = makeEntry({
  id: 'old-card',
  amountCents: -30000,
  day: 8,
  pot: 'comfort',
  accountId: 'old',
  startMonth: '2026-12',
})
const oldIncome = makeEntry({
  id: 'old-income',
  kind: 'income',
  pot: null,
  amountCents: 70000,
  day: 3,
  accountId: 'old',
  startMonth: '2026-12',
})
/** Active → archived: only the checking side counts. */
const toOld = makeEntry({
  id: 'to-old',
  kind: 'transfer',
  pot: null,
  amountCents: -40000,
  day: 6,
  toAccountId: 'old',
  startMonth: '2026-12',
})
/** Archived → active: only the checking side counts. */
const fromOld = makeEntry({
  id: 'from-old',
  kind: 'transfer',
  pot: null,
  amountCents: -15000,
  day: 7,
  accountId: 'old',
  toAccountId: 'checking',
  startMonth: '2026-12',
})

const entries = [salary, rent, oldCard, oldIncome, toOld, fromOld]

function accounts(archived: boolean) {
  return [
    { id: 'checking', bankId: 'b1', openingBalanceCents: 100000, archived: false },
    { id: 'old', bankId: 'b1', openingBalanceCents: 900000, archived },
  ]
}

function project(archived: boolean): MonthResult[] {
  return projectMonths({
    entries,
    parts: [],
    overrides: [],
    accounts: accounts(archived),
    months: monthRange('2026-12', '2027-01'),
  })
}

function december(archived: boolean): MonthResult {
  const result = project(archived)[0]
  if (result === undefined) throw new Error('missing 2026-12')
  return result
}

describe('archived accounts', () => {
  it('leave the balances: no opening balance, no entries, only the active side of transfers', () => {
    const result = december(true)
    expect(result.openingBalances).toEqual({ checking: 100000 })
    // 100k + 500k − 200k − 40k (to old) + 15k (from old).
    expect(result.closingBalances).toEqual({ checking: 375000 })
  })

  it('leave the month totals and the pots', () => {
    const { totals } = december(true)
    expect(totals.incomeCents).toBe(500000)
    expect(totals.expenseCents).toBe(200000)
    expect(totals.byPot).toEqual({ essential: 200000 })
    const [month] = budgetMonths([december(true)], [])
    expect(month?.incomeCents).toBe(500000)
  })

  it('hide their own entries but keep transfers that touch an active account', () => {
    const ids = december(true).landings.map((l) => l.entry.id)
    expect(ids).toEqual(['salary', 'to-old', 'from-old', 'rent'])
  })

  it('stay out of the day-by-day balance and the calendar, even when a filter names them', () => {
    const result = december(true)
    const all = dailyBalance(result, null)
    expect(all.openingCents).toBe(100000)
    expect(all.rows.map((r) => r.effectCents)).toEqual([500000, -40000, 15000, -200000])
    expect(all.closingCents).toBe(375000)
    // An explicit id list that still carries the archived account.
    expect(dailyBalance(result, ['checking', 'old']).closingCents).toBe(375000)
    const grid = calendarMonth(result, ['checking', 'old'])
    expect(grid.days.at(-1)?.endBalanceCents).toBe(375000)
    expect(decisionAccountIds('', accounts(true))).toEqual(['checking'])
    expect(decisionAccountIds('b:b1', accounts(true))).toEqual(['checking'])
    expect(accountIdsOf('old', accounts(true))).toEqual([])
  })

  it('hide their skipped occurrences in the calendar', () => {
    const overrides = [makeOverride({ entryId: 'old-card', month: '2026-12', skipped: true })]
    const cells = dayCells([december(true)], null, {
      entries,
      parts: [],
      overrides,
      accounts: accounts(true),
    })
    expect(cells.get('2026-12-08')?.skipped).toEqual([])
    const shown = dayCells([december(false)], null, {
      entries,
      parts: [],
      overrides,
      accounts: accounts(false),
    })
    expect(shown.get('2026-12-08')?.skipped).toHaveLength(1)
  })

  it('leave the dashboard balances', () => {
    expect(accountBalancesOn(december(true), 31)).toEqual({ checking: 375000 })
    expect(balanceSnapshot(project(true), '2026-12-31')?.todayCents).toBe(375000)
  })

  it('leave the search and its totals', () => {
    const occurrences = searchOccurrences([december(true)], parseSearchQuery(''), {
      accounts: accounts(true).map((a) => ({ ...a, name: a.id, type: 'checking' as const })),
      banks: [{ id: 'b1', name: 'Banco' }],
      categories: [],
    })
    expect(occurrences.map((o) => o.landing.entry.id)).not.toContain('old-card')
    expect(searchTotals(occurrences)).toMatchObject({ incomeCents: 500000, expenseCents: -200000 })
  })

  it('count again in full once unarchived', () => {
    const result = december(false)
    expect(result.openingBalances).toEqual({ checking: 100000, old: 900000 })
    expect(result.totals.incomeCents).toBe(570000)
    expect(result.totals.expenseCents).toBe(230000)
    expect(result.landings).toHaveLength(6)
  })

  it('archivedFilter keeps every entry when nothing is archived', () => {
    expect(archivedFilter([{ id: 'old' }])(oldCard)).toBe(true)
    expect(archivedFilter([{ id: 'old', archived: true }])(oldCard)).toBe(false)
  })
})
