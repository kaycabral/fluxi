import type { Entry, EntryOverride, EntryPart } from './types'

/** Test builders for the ledger core (plain data, no I/O). */
export function makeEntry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'e1',
    kind: 'expense',
    description: 'Luz',
    amountCents: 26000,
    accountId: 'checking',
    toAccountId: null,
    categoryId: null,
    pot: 'essential',
    tags: [],
    startMonth: '2026-09',
    day: 15,
    recurrence: 'monthly',
    repeatEvery: 1,
    monthBy: 'day',
    installments: null,
    endMonth: null,
    ...overrides,
  }
}

export function makePart(overrides: Partial<EntryPart> = {}): EntryPart {
  return {
    id: 'p1',
    entryId: 'e1',
    label: 'Parte',
    bps: 10000,
    day: 5,
    nextMonth: false,
    sort: 0,
    ...overrides,
  }
}

export function makeOverride(overrides: Partial<EntryOverride> = {}): EntryOverride {
  return {
    entryId: 'e1',
    month: '2026-09',
    amountCents: null,
    day: null,
    skipped: false,
    deleted: false,
    ...overrides,
  }
}

/** The prototype's salary split: advance 40% on day 20, rest 60% on day 5 of the next month. */
export function salarySplit(entryId: string): EntryPart[] {
  return [
    makePart({ id: `${entryId}-a`, entryId, label: 'Adiantamento', bps: 4000, day: 20, sort: 0 }),
    makePart({
      id: `${entryId}-b`,
      entryId,
      label: 'Saldo',
      bps: 6000,
      day: 5,
      nextMonth: true,
      sort: 1,
    }),
  ]
}
