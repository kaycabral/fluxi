import { addMonths, diffMonths, type Month } from './month'
import { installmentCount, installmentShares, occursIn } from './occurrence'
import type { Entry, EntryOverride, EntryPart } from './types'

export type EditScope = 'one' | 'future' | 'all'

export type OccurrencePatch = {
  amountCents?: number
  day?: number
  /**
   * New split of the series (empty: no split), as parts of the edited entry.
   * Series-level: it applies with `future` or `all`, never to one month.
   */
  parts?: readonly EntryPart[]
}

export type ScopedEdit = {
  /** Occurrence (competence month) the edit was made on. */
  month: Month
  patch: OccurrencePatch
  scope: EditScope
}

export type SeriesState = {
  entry: Entry
  parts: readonly EntryPart[]
  overrides: readonly EntryOverride[]
}

export type ScopedEditResult = {
  /** The edited entry first; a second entry when `future` split the series. */
  entries: Entry[]
  /** Parts of every entry in `entries` (the new entry gets copies with new ids). */
  parts: EntryPart[]
  /** Complete override set of every entry in `entries`. */
  overrides: EntryOverride[]
}

const ownParts = (state: SeriesState) => state.parts.filter((p) => p.entryId === state.entry.id)

type PartSpec = Pick<EntryPart, 'label' | 'bps' | 'day' | 'nextMonth'>

/** Whether `next` (in order) is the same split as the entry's `current` parts. */
export function sameSplit(next: readonly PartSpec[], current: readonly EntryPart[]): boolean {
  const ordered = [...current].sort((a, b) => a.sort - b.sort)
  return (
    next.length === ordered.length &&
    next.every((p, i) => {
      const c = ordered[i]
      return (
        c !== undefined &&
        c.label === p.label &&
        c.bps === p.bps &&
        c.day === p.day &&
        c.nextMonth === p.nextMonth
      )
    })
  )
}

/** The series' parts after the patch (the new split, or the current one). */
const patchedParts = (state: SeriesState, patch: OccurrencePatch): EntryPart[] =>
  patch.parts === undefined
    ? ownParts(state)
    : patch.parts.map((p) => ({ ...p, entryId: state.entry.id }))

const isEmptyOverride = (o: EntryOverride) => o.amountCents === null && o.day === null && !o.skipped

/**
 * Apply a per-occurrence patch to every occurrence of `entry`. An installment
 * entry stores the total, so a new installment amount becomes `amount × count`.
 */
function patchEntry(entry: Entry, patch: OccurrencePatch): Entry {
  // A new split takes its first part's day (the entry's day while it is split).
  const day = patch.day ?? patch.parts?.[0]?.day
  // A new day for the whole series pins it to that day number (no weekday rule).
  const dayRule = day === undefined ? {} : { day, monthBy: 'day' as const }
  if (patch.amountCents === undefined) return { ...entry, ...dayRule }
  const count = entry.recurrence === 'installments' ? Math.max(1, installmentCount(entry)) : 1
  return { ...entry, amountCents: patch.amountCents * count, ...dayRule }
}

function editOne(state: SeriesState, month: Month, patch: OccurrencePatch): ScopedEditResult {
  if (patch.parts !== undefined) {
    throw new RangeError('a new split applies to the series, not to one occurrence')
  }
  const { entry } = state
  const own = state.overrides.filter((o) => o.entryId === entry.id)
  const current = own.find((o) => o.month === month) ?? {
    entryId: entry.id,
    month,
    amountCents: null,
    day: null,
    skipped: false,
  }
  const next: EntryOverride = {
    ...current,
    amountCents: patch.amountCents ?? current.amountCents,
    day: patch.day ?? current.day,
  }
  return {
    entries: [entry],
    parts: ownParts(state),
    overrides: [...own.filter((o) => o.month !== month), next],
  }
}

function editAll(state: SeriesState, patch: OccurrencePatch): ScopedEditResult {
  const { entry } = state
  const overrides = state.overrides
    .filter((o) => o.entryId === entry.id)
    .map((o) => ({
      ...o,
      amountCents: patch.amountCents === undefined ? o.amountCents : null,
      day: patch.day === undefined ? o.day : null,
    }))
    .filter((o) => !isEmptyOverride(o))
  return { entries: [patchEntry(entry, patch)], parts: patchedParts(state, patch), overrides }
}

/**
 * The series after its occurrence of `from` is moved to the month `to` (the
 * date's month in the sheet): the start moves by as many months, the end
 * stays. Opening the first occurrence and picking the month before makes the
 * repetition start a month earlier.
 */
export function shiftStart(entry: Entry, from: Month, to: Month): Entry {
  return { ...entry, startMonth: addMonths(entry.startMonth, diffMonths(from, to)) }
}

/**
 * The series cut to end right before `month` (a later occurrence): installments
 * keep the ones already due and their share of the total (leftover cents
 * included); other series end at `month - 1`.
 */
export function endSeriesBefore(entry: Entry, month: Month): Entry {
  if (entry.recurrence !== 'installments') return { ...entry, endMonth: addMonths(month, -1) }
  const total = installmentCount(entry)
  const done = diffMonths(entry.startMonth, month)
  const { rest } = installmentShares(entry.amountCents, total)
  return { ...entry, installments: done, amountCents: entry.amountCents - rest * (total - done) }
}

function editFuture(
  state: SeriesState,
  month: Month,
  patch: OccurrencePatch,
  newId: () => string,
): ScopedEditResult {
  const { entry } = state
  const own = state.overrides.filter((o) => o.entryId === entry.id)
  if (month === entry.startMonth) {
    return {
      entries: [patchEntry(entry, patch)],
      parts: patchedParts(state, patch),
      overrides: own,
    }
  }

  const done = diffMonths(entry.startMonth, month)
  const isInstallments = entry.recurrence === 'installments'
  const total = installmentCount(entry)
  const before = endSeriesBefore(entry, month)
  // The installments not yet due take the rest of the total with them.
  const remainingCents = entry.amountCents - before.amountCents
  const after: Entry = patchEntry(
    {
      ...entry,
      id: newId(),
      startMonth: month,
      installments: isInstallments ? total - done : entry.installments,
      amountCents: isInstallments ? remainingCents : entry.amountCents,
    },
    patch,
  )
  // The new series gets the new split (or copies of the current one); the old keeps its own.
  const copiedParts = patchedParts(state, patch).map((p) => ({
    ...p,
    id: newId(),
    entryId: after.id,
  }))

  return {
    entries: [before, after],
    parts: [...ownParts(state), ...copiedParts],
    overrides: [
      ...own.filter((o) => o.month < month),
      ...own.filter((o) => o.month >= month).map((o) => ({ ...o, entryId: after.id })),
    ],
  }
}

/**
 * Apply an amount/day change made on the occurrence of `month`:
 * - `one`: a per-month override (merged into an existing one); a new split
 *   (`patch.parts`) cannot apply to one month and throws;
 * - `future`: from `month` on. At the series start it edits the entry;
 *   otherwise it SPLITS the series: the original ends at `month - 1` (or keeps
 *   the installments already due, and their share of the total) and a new
 *   entry starts at `month` with the patch, the remaining installments (and
 *   their share of the total), the new split (or copies of the current parts)
 *   and the overrides from `month` on;
 * - `all`: edits the entry (and its split) and clears the patched fields
 *   from every override (dropping overrides left empty).
 *
 * The patch amount is per occurrence; for installments (whose entry stores
 * the total) it is multiplied by the installment count.
 *
 * `month` must be an occurrence of the entry. `newId` mints ids for the split.
 */
export function applyScopedEdit(
  state: SeriesState,
  edit: ScopedEdit,
  newId: () => string,
): ScopedEditResult {
  const { month, patch, scope } = edit
  if (!occursIn(state.entry, month)) {
    throw new RangeError(`entry ${state.entry.id} has no occurrence in ${month}`)
  }
  switch (scope) {
    case 'one':
      return editOne(state, month, patch)
    case 'all':
      return editAll(state, patch)
    case 'future':
      return editFuture(state, month, patch, newId)
  }
}
