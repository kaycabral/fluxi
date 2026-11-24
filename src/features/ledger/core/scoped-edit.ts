import { addMonths, diffMonths, type Month } from './month'
import { occursIn } from './occurrence'
import type { Entry, EntryOverride, EntryPart } from './types'

export type EditScope = 'one' | 'future' | 'all'

export type OccurrencePatch = {
  amountCents?: number
  day?: number
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

const isEmptyOverride = (o: EntryOverride) => o.amountCents === null && o.day === null && !o.skipped

function patchEntry(entry: Entry, patch: OccurrencePatch): Entry {
  return {
    ...entry,
    amountCents: patch.amountCents ?? entry.amountCents,
    day: patch.day ?? entry.day,
  }
}

function editOne(state: SeriesState, month: Month, patch: OccurrencePatch): ScopedEditResult {
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
  return { entries: [patchEntry(entry, patch)], parts: ownParts(state), overrides }
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
    return { entries: [patchEntry(entry, patch)], parts: ownParts(state), overrides: own }
  }

  const done = diffMonths(entry.startMonth, month)
  const isInstallments = entry.recurrence === 'installments'
  const total = entry.installments ?? 0
  const before: Entry = isInstallments
    ? { ...entry, installments: done }
    : { ...entry, endMonth: addMonths(month, -1) }
  const after: Entry = patchEntry(
    {
      ...entry,
      id: newId(),
      startMonth: month,
      installments: isInstallments ? total - done : entry.installments,
    },
    patch,
  )
  const copiedParts = ownParts(state).map((p) => ({ ...p, id: newId(), entryId: after.id }))

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
 * - `one`: a per-month override (merged into an existing one);
 * - `future`: from `month` on. At the series start it edits the entry;
 *   otherwise it SPLITS the series: the original ends at `month - 1` (or keeps
 *   the installments already due) and a new entry starts at `month` with the
 *   patch, the remaining installments, copies of the parts and the overrides
 *   from `month` on;
 * - `all`: edits the entry and clears the patched fields from every override
 *   (dropping overrides left empty).
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
