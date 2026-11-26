import { describe, expect, it } from 'vitest'
import { changesBankFields } from './bank-lock'
import { makeEntry } from './fixtures'
import type { EntryFields } from './schemas'

const entry = makeEntry({ recurrence: 'none', fromBank: true, startMonth: '2026-11', day: 3 })
const fields: EntryFields = {
  kind: entry.kind,
  description: entry.description,
  amountCents: entry.amountCents,
  accountId: entry.accountId,
  toAccountId: entry.toAccountId,
  categoryId: entry.categoryId,
  pot: entry.pot,
  tags: [...entry.tags],
  startMonth: entry.startMonth,
  day: entry.day,
  recurrence: entry.recurrence,
  repeatEvery: entry.repeatEvery,
  monthBy: entry.monthBy,
  installments: entry.installments,
  endMonth: entry.endMonth,
  parts: [],
}

describe('changesBankFields', () => {
  it('lets the user own description, category, pot and tags', () => {
    expect(
      changesBankFields(entry, {
        ...fields,
        description: 'Outra',
        categoryId: 'c1',
        pot: 'comfort',
        tags: ['x'],
      }),
    ).toBe(false)
  })

  it('flags every field the bank owns', () => {
    const patches: Partial<EntryFields>[] = [
      { kind: 'income' },
      { amountCents: 1 },
      { accountId: 'other' },
      { toAccountId: 'other' },
      { startMonth: '2026-12' },
      { day: 4 },
      { recurrence: 'monthly' },
      { repeatEvery: 2 },
      { monthBy: 'weekday' },
      { installments: 3 },
      { endMonth: '2027-01' },
      { parts: [{ label: 'A', bps: 10000, day: 1, nextMonth: false }] },
    ]
    for (const patch of patches)
      expect(changesBankFields(entry, { ...fields, ...patch })).toBe(true)
  })
})
