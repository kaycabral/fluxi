import 'server-only'

import {
  accounts,
  banks,
  budgetPots,
  entries,
  entryOverrides,
  entryParts,
  userSettings,
} from '@/db/schema'
import { monthToDate, type Month } from '@/features/ledger/core/month'
import { amountFor, dayFor, occursIn } from '@/features/ledger/core/occurrence'
import { keepPartIds } from '@/features/ledger/core/payments'
import type { EntryFields, PotTargets } from '@/features/ledger/core/schemas'
import {
  applyScopedEdit,
  endSeriesBefore,
  sameSplit,
  shiftStart,
  type EditScope,
  type OccurrencePatch,
  type ScopedEditResult,
  type SeriesState,
} from '@/features/ledger/core/scoped-edit'
import {
  POT_KEYS,
  type AccountType,
  type Entry,
  type EntryOverride,
  type EntryPart,
} from '@/features/ledger/core/types'
import { and, eq, gte, notInArray, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { movePaymentsToSplit, syncPayments } from './payments.write'
import { captureUndo, widenUndo } from './undo.write'
import {
  db,
  fail,
  guarded,
  loadSeries,
  ok,
  ScopeError,
  undoable,
  type Tx,
  type WriteResult,
} from './write-base'

/**
 * Write side of the ledger. Every function takes the session `userId` and
 * every UPDATE/DELETE filters by it, so a foreign id is a no-op
 * (`not_found`); inserts that point at another user's account/category are
 * refused by the composite `(id, user_id)` foreign keys (`invalid_reference`).
 * Multi-row changes (scoped edits, series splits, pot targets) run in one
 * transaction with the entry row locked.
 */

export type { WriteFailure, WriteResult } from './write-base'

function entryColumns(entry: Entry) {
  return {
    kind: entry.kind,
    description: entry.description,
    amountCents: entry.amountCents,
    accountId: entry.accountId,
    toAccountId: entry.toAccountId,
    categoryId: entry.categoryId,
    pot: entry.pot,
    tags: [...entry.tags],
    startMonth: monthToDate(entry.startMonth),
    day: entry.day,
    recurrence: entry.recurrence,
    repeatEvery: entry.repeatEvery,
    monthBy: entry.monthBy,
    installments: entry.installments,
    endMonth: entry.endMonth === null ? null : monthToDate(entry.endMonth),
  }
}

function entryFromFields(id: string, fields: EntryFields): Entry {
  return {
    id,
    kind: fields.kind,
    description: fields.description,
    amountCents: fields.amountCents,
    accountId: fields.accountId,
    toAccountId: fields.toAccountId,
    categoryId: fields.categoryId,
    pot: fields.pot,
    tags: fields.tags,
    startMonth: fields.startMonth,
    day: fields.day,
    recurrence: fields.recurrence,
    repeatEvery: fields.repeatEvery,
    monthBy: fields.monthBy,
    installments: fields.installments,
    endMonth: fields.endMonth,
  }
}

function partsFromFields(entryId: string, fields: EntryFields): EntryPart[] {
  return fields.parts.map((p, sort) => ({ id: randomUUID(), entryId, sort, ...p }))
}

function partRow(userId: string, part: EntryPart) {
  return {
    id: part.id,
    entryId: part.entryId,
    userId,
    label: part.label,
    bps: part.bps,
    day: part.day,
    nextMonth: part.nextMonth,
    sort: part.sort,
  }
}

function overrideRow(userId: string, override: EntryOverride) {
  return {
    entryId: override.entryId,
    userId,
    month: monthToDate(override.month),
    amountCents: override.amountCents,
    day: override.day,
    skipped: override.skipped,
    deleted: override.deleted,
  }
}

/** Create an entry with its parts. Idempotent on `id`: a replay is a no-op. */
export async function createEntry(
  userId: string,
  id: string,
  fields: EntryFields,
): Promise<WriteResult> {
  return guarded(() =>
    db().transaction(async (tx) => {
      const inserted = await tx
        .insert(entries)
        .values({ id, userId, ...entryColumns(entryFromFields(id, fields)) })
        .onConflictDoNothing({ target: entries.id })
        .returning({ id: entries.id })
      if (inserted.length === 0) {
        // Replay of the same create: fine for its owner, invisible to anyone else.
        const [mine] = await tx
          .select({ id: entries.id })
          .from(entries)
          .where(and(eq(entries.id, id), eq(entries.userId, userId)))
        return mine === undefined ? fail('not_found') : ok
      }
      const parts = partsFromFields(id, fields)
      if (parts.length > 0) await tx.insert(entryParts).values(parts.map((p) => partRow(userId, p)))
      // Its undo removes it: nothing of it existed before.
      return undoable(await captureUndo(tx, userId, [id], { created: true }))
    }),
  )
}

async function writeEntryRow(tx: Tx, userId: string, entry: Entry): Promise<void> {
  await tx
    .update(entries)
    .set({ ...entryColumns(entry), updatedAt: sql`now()` })
    .where(and(eq(entries.id, entry.id), eq(entries.userId, userId)))
}

/**
 * Make `parts` the entry's parts. Parts keep their ids where they persist (see
 * `keepPartIds`), so they are upserted in place instead of re-created: a
 * re-created part would cascade its payments away.
 */
async function replaceParts(
  tx: Tx,
  userId: string,
  entryId: string,
  parts: readonly EntryPart[],
): Promise<void> {
  const ids = parts.map((p) => p.id)
  await tx
    .delete(entryParts)
    .where(
      and(
        eq(entryParts.entryId, entryId),
        eq(entryParts.userId, userId),
        ids.length > 0 ? notInArray(entryParts.id, ids) : undefined,
      ),
    )
  for (const part of parts) {
    const row = partRow(userId, part)
    await tx
      .insert(entryParts)
      .values(row)
      .onConflictDoUpdate({
        target: entryParts.id,
        set: {
          label: row.label,
          bps: row.bps,
          day: row.day,
          nextMonth: row.nextMonth,
          sort: row.sort,
          updatedAt: sql`now()`,
        },
        setWhere: and(eq(entryParts.entryId, entryId), eq(entryParts.userId, userId)),
      })
  }
}

/** Persist a scoped edit computed from `state` (whose entry is the locked row). */
async function persistScopedEdit(
  tx: Tx,
  userId: string,
  state: SeriesState,
  result: ScopedEditResult,
): Promise<void> {
  const [edited, split] = result.entries
  if (edited === undefined) return
  await writeEntryRow(tx, userId, edited)
  await replaceParts(
    tx,
    userId,
    edited.id,
    result.parts.filter((p) => p.entryId === edited.id),
  )
  if (split !== undefined) {
    await tx.insert(entries).values({ id: split.id, userId, ...entryColumns(split) })
    const copied = result.parts.filter((p) => p.entryId === split.id)
    if (copied.length > 0) await tx.insert(entryParts).values(copied.map((p) => partRow(userId, p)))
    await movePaymentsToSplit(tx, userId, state, { entry: split, parts: copied })
  }
  await tx
    .delete(entryOverrides)
    .where(and(eq(entryOverrides.entryId, state.entry.id), eq(entryOverrides.userId, userId)))
  if (result.overrides.length > 0) {
    await tx.insert(entryOverrides).values(result.overrides.map((o) => overrideRow(userId, o)))
  }
}

/** The entries a scoped edit created (a series split): all but the edited one. */
const createdBy = (result: ScopedEditResult, entryId: string) =>
  result.entries.map((e) => e.id).filter((id) => id !== entryId)

function patchOf(
  state: SeriesState,
  month: Month,
  fields: EntryFields,
  parts: readonly EntryPart[],
): OccurrencePatch {
  const patch: OccurrencePatch = {}
  if (fields.amountCents !== amountFor(state.entry, state.overrides, month))
    patch.amountCents = fields.amountCents
  if (fields.parts.length === 0 && fields.day !== dayFor(state.entry, state.overrides, month))
    patch.day = fields.day
  if (!sameSplit(fields.parts, state.parts)) patch.parts = parts
  return patch
}

const isEmpty = (patch: OccurrencePatch) =>
  patch.amountCents === undefined && patch.day === undefined && patch.parts === undefined

export type OccurrenceEdit = { month: Month; scope: EditScope | null }

/**
 * Update an entry. Without `occurrence` (or for a non-recurring entry) every
 * field is replaced. With `occurrence` on a recurring entry, the series-level
 * fields (description, accounts, category, pot, tags, recurrence) apply to the
 * series and an amount/day/split change on that occurrence goes through
 * {@link applyScopedEdit} with the given scope (`scope_required` without one;
 * a new split cannot apply to one month: `split_needs_series`).
 */
export async function updateEntry(
  userId: string,
  entryId: string,
  fields: EntryFields,
  occurrence: OccurrenceEdit | null,
): Promise<WriteResult> {
  return guarded(() =>
    db().transaction(async (tx) => {
      const state = await loadSeries(tx, userId, entryId)
      if (state === null) return fail('not_found')
      const parts = keepPartIds(partsFromFields(entryId, fields), state.parts)

      if (occurrence === null || state.entry.recurrence === 'none') {
        const undo = await captureUndo(tx, userId, [entryId])
        await writeEntryRow(tx, userId, entryFromFields(entryId, fields))
        await replaceParts(tx, userId, entryId, parts)
        await syncPayments(tx, userId, entryId)
        return undoable(undo)
      }

      if (!occursIn(state.entry, occurrence.month)) return fail('no_occurrence')
      const patch = patchOf(state, occurrence.month, fields, parts)
      if (!isEmpty(patch) && occurrence.scope === null) return fail('scope_required')
      if (patch.parts !== undefined && occurrence.scope === 'one') {
        return fail('split_needs_series')
      }

      // A new month on the date moves the repetition's start by as many months.
      const moved = fields.startMonth
      const series: Entry = shiftStart(
        {
          ...entryFromFields(entryId, fields),
          amountCents: state.entry.amountCents,
          day: state.entry.day,
          startMonth: state.entry.startMonth,
        },
        occurrence.month,
        moved,
      )
      if (!occursIn(series, moved)) throw new ScopeError('no_occurrence')
      const undo = await captureUndo(tx, userId, [entryId])
      await writeEntryRow(tx, userId, series)
      if (isEmpty(patch) || occurrence.scope === null) {
        await syncPayments(tx, userId, entryId)
        return undoable(undo)
      }

      const next: SeriesState = { entry: series, parts: state.parts, overrides: state.overrides }
      const result = applyScopedEdit(
        next,
        { month: moved, patch, scope: occurrence.scope },
        randomUUID,
      )
      await persistScopedEdit(tx, userId, next, result)
      for (const entry of result.entries) await syncPayments(tx, userId, entry.id)
      await widenUndo(tx, userId, createdBy(result, entryId))
      return undoable(undo)
    }),
  )
}

/** Move one occurrence to another day (the timeline's inline day input). */
export async function changeOccurrenceDay(
  userId: string,
  input: { entryId: string; month: Month; day: number; scope: EditScope | null },
): Promise<WriteResult> {
  return guarded(() =>
    db().transaction(async (tx) => {
      const { entryId, month, day, scope } = input
      const state = await loadSeries(tx, userId, entryId)
      if (state === null) return fail('not_found')
      if (!occursIn(state.entry, month) || state.parts.length > 0) return fail('no_occurrence')
      if (state.entry.recurrence === 'none') {
        const undo = await captureUndo(tx, userId, [entryId])
        await writeEntryRow(tx, userId, { ...state.entry, day })
        return undoable(undo)
      }
      if (dayFor(state.entry, state.overrides, month) === day) return ok
      if (scope === null) return fail('scope_required')
      const undo = await captureUndo(tx, userId, [entryId])
      const result = applyScopedEdit(state, { month, patch: { day }, scope }, randomUUID)
      await persistScopedEdit(tx, userId, state, result)
      for (const entry of result.entries) await syncPayments(tx, userId, entry.id)
      await widenUndo(tx, userId, createdBy(result, entryId))
      return undoable(undo)
    }),
  )
}

/**
 * Delete an entry, or part of a recurring series from the occurrence of
 * `month`: `one` skips that occurrence, `future` ends the series before it
 * (deleting it when `month` is the start), `all` deletes the entry.
 */
export async function deleteEntry(
  userId: string,
  entryId: string,
  occurrence: { month: Month; scope: EditScope } | null,
): Promise<WriteResult> {
  return guarded(() =>
    db().transaction(async (tx) => {
      const state = await loadSeries(tx, userId, entryId)
      if (state === null) return fail('not_found')
      const { entry } = state
      const removeAll = async () => {
        const undo = await captureUndo(tx, userId, [entryId])
        await tx.delete(entries).where(and(eq(entries.id, entryId), eq(entries.userId, userId)))
        return undoable(undo)
      }
      if (occurrence === null || entry.recurrence === 'none' || occurrence.scope === 'all')
        return removeAll()
      const { month, scope } = occurrence
      if (!occursIn(entry, month)) return fail('no_occurrence')

      if (scope === 'one') {
        const undo = await captureUndo(tx, userId, [entryId])
        await tx
          .insert(entryOverrides)
          .values({ entryId, userId, month: monthToDate(month), skipped: true, deleted: true })
          .onConflictDoUpdate({
            target: [entryOverrides.entryId, entryOverrides.month],
            set: { skipped: true, deleted: true, updatedAt: sql`now()` },
            setWhere: eq(entryOverrides.userId, userId),
          })
        await syncPayments(tx, userId, entryId)
        return undoable(undo)
      }

      if (month === entry.startMonth) return removeAll()
      const undo = await captureUndo(tx, userId, [entryId])
      await writeEntryRow(tx, userId, endSeriesBefore(entry, month))
      await tx
        .delete(entryOverrides)
        .where(
          and(
            eq(entryOverrides.entryId, entryId),
            eq(entryOverrides.userId, userId),
            gte(entryOverrides.month, monthToDate(month)),
          ),
        )
      await syncPayments(tx, userId, entryId)
      return undoable(undo)
    }),
  )
}

/** Create a bank. Idempotent on `id`. */
export async function createBank(
  userId: string,
  input: { id: string; name: string },
): Promise<WriteResult> {
  const sort = await db()
    .select({ next: sql<number>`coalesce(max(${banks.sort}), -1) + 1` })
    .from(banks)
    .where(eq(banks.userId, userId))
  await db()
    .insert(banks)
    .values({ id: input.id, userId, name: input.name, sort: sort[0]?.next ?? 0 })
    .onConflictDoNothing({ target: banks.id })
  return ok
}

export async function updateBank(
  userId: string,
  input: { id: string; name: string },
): Promise<WriteResult> {
  const rows = await db()
    .update(banks)
    .set({ name: input.name, updatedAt: sql`now()` })
    .where(and(eq(banks.id, input.id), eq(banks.userId, userId)))
    .returning({ id: banks.id })
  return rows.length === 0 ? fail('not_found') : ok
}

export type AccountInput = {
  id: string
  bankId: string
  name: string
  type: AccountType
  openingBalanceCents: number
}

/** Create an account in one of the user's banks. Idempotent on `id`. */
export async function createAccount(userId: string, input: AccountInput): Promise<WriteResult> {
  return guarded(async () => {
    await db()
      .insert(accounts)
      .values({ ...input, userId })
      .onConflictDoNothing({ target: accounts.id })
    return ok
  })
}

export async function updateAccount(
  userId: string,
  input: Omit<AccountInput, 'bankId'> & { archived: boolean },
): Promise<WriteResult> {
  const rows = await db()
    .update(accounts)
    .set({
      name: input.name,
      type: input.type,
      openingBalanceCents: input.openingBalanceCents,
      // Keep the original archive time when it stays archived.
      archivedAt: input.archived ? sql`coalesce(${accounts.archivedAt}, now())` : null,
      updatedAt: sql`now()`,
    })
    .where(and(eq(accounts.id, input.id), eq(accounts.userId, userId)))
    .returning({ id: accounts.id })
  return rows.length === 0 ? fail('not_found') : ok
}

/** Replace the pot targets; refused when they would sum past 100%. */
export async function setPotTargets(userId: string, targets: PotTargets): Promise<WriteResult> {
  if (POT_KEYS.reduce((sum, key) => sum + targets[key], 0) > 10000) return fail('over_budget')
  return db().transaction(async (tx) => {
    for (const key of POT_KEYS) {
      await tx
        .update(budgetPots)
        .set({ targetBps: targets[key], updatedAt: sql`now()` })
        .where(and(eq(budgetPots.userId, userId), eq(budgetPots.key, key)))
    }
    return ok
  })
}

export async function setCountFrom(userId: string, month: Month): Promise<WriteResult> {
  await db()
    .insert(userSettings)
    .values({ userId, countFromMonth: monthToDate(month) })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: { countFromMonth: monthToDate(month), updatedAt: sql`now()` },
    })
  return ok
}
