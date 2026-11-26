import { addMonths, diffMonths, type Month } from './month'
import { installmentCount, occursIn } from './occurrence'
import { endSeriesBefore } from './scoped-edit'
import type { Entry } from './types'

/**
 * Cutting the ledger's history at a month (the one-off production step that
 * makes "the past is the bank's" true from `cut` on): nothing before `cut`
 * stays. Pure; `scripts/ledger-cut.ts` applies it.
 *
 * - a one-off entry before `cut` is deleted;
 * - a series that started before `cut` starts at its first occurrence from
 *   `cut` on (monthly/yearly keep their rhythm and end), or is deleted when it
 *   has none left;
 * - an installment series keeps only the installments from `cut` on, with
 *   the slice of the total they carry: the same arithmetic as ending a series
 *   (`endSeriesBefore`), seen from the other side;
 * - overrides and payments of months before `cut` go (the caller deletes
 *   them for every kept entry); parts belong to the entry and stay.
 */
export type CutAction = { type: 'keep' } | { type: 'delete' } | { type: 'move'; entry: Entry }

/** First month `entry` occurs in from `cut` on, if any (overrides aside). */
function firstOccurrenceFrom(entry: Entry, cut: Month): Month | null {
  const step = entry.recurrence === 'yearly' ? 12 * entry.repeatEvery : entry.repeatEvery
  const elapsed = diffMonths(entry.startMonth, cut)
  const first = addMonths(entry.startMonth, Math.ceil(elapsed / step) * step)
  return occursIn(entry, first) ? first : null
}

export function cutEntry(entry: Entry, cut: Month): CutAction {
  if (entry.startMonth >= cut) return { type: 'keep' }
  switch (entry.recurrence) {
    case 'none':
      return { type: 'delete' }
    case 'installments': {
      const total = installmentCount(entry)
      const done = diffMonths(entry.startMonth, cut)
      if (done >= total) return { type: 'delete' }
      const before = endSeriesBefore(entry, cut)
      return {
        type: 'move',
        entry: {
          ...entry,
          startMonth: cut,
          installments: total - done,
          amountCents: entry.amountCents - before.amountCents,
        },
      }
    }
    case 'monthly':
    case 'yearly': {
      const first = firstOccurrenceFrom(entry, cut)
      return first === null
        ? { type: 'delete' }
        : { type: 'move', entry: { ...entry, startMonth: first } }
    }
  }
}

export type CutPlan = { deleted: string[]; moved: Entry[]; kept: number }

/** The cut of every entry (entries in `protectedIds`, e.g. bank-linked, are always kept). */
export function planCut(
  entries: readonly Entry[],
  cut: Month,
  protectedIds: ReadonlySet<string> = new Set(),
): CutPlan {
  const plan: CutPlan = { deleted: [], moved: [], kept: 0 }
  for (const entry of entries) {
    const action = protectedIds.has(entry.id) ? { type: 'keep' as const } : cutEntry(entry, cut)
    if (action.type === 'delete') plan.deleted.push(entry.id)
    else if (action.type === 'move') plan.moved.push(action.entry)
    else plan.kept += 1
  }
  return plan
}
