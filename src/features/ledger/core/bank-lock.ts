import type { EntryFields } from './schemas'
import type { Entry } from './types'

/**
 * A bank-materialized entry is the bank's: only its description, category,
 * pot and tags are the user's. Whether `fields` (the form's whole entry)
 * changes anything else of `entry` — refused by the writes and locked in the
 * sheet. Parts are refused too: they would move money to other days.
 */
export function changesBankFields(entry: Entry, fields: EntryFields): boolean {
  return (
    fields.kind !== entry.kind ||
    fields.amountCents !== entry.amountCents ||
    fields.accountId !== entry.accountId ||
    fields.toAccountId !== entry.toAccountId ||
    fields.startMonth !== entry.startMonth ||
    fields.day !== entry.day ||
    fields.recurrence !== entry.recurrence ||
    fields.repeatEvery !== entry.repeatEvery ||
    fields.monthBy !== entry.monthBy ||
    fields.installments !== entry.installments ||
    fields.endMonth !== entry.endMonth ||
    fields.parts.length > 0
  )
}
