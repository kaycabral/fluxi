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
import {
  addMonths,
  diffMonths,
  monthFromDate,
  monthToDate,
  type Month,
} from '@/features/ledger/core/month'
import { amountFor, dayFor, occursIn } from '@/features/ledger/core/occurrence'
import type { EntryFields, PotTargets } from '@/features/ledger/core/schemas'
import {
  applyScopedEdit,
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
import { fluxiDb, type FluxiDb } from '@/lib/db'
import { isForeignKeyViolation } from '@cbrl/pg'
import { and, asc, eq, gte, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

/**
 * Write side of the ledger. Every function takes the session `userId` and
 * every UPDATE/DELETE filters by it, so a foreign id is a no-op
 * (`not_found`); inserts that point at another user's account/category are
 * refused by the composite `(id, user_id)` foreign keys (`invalid_reference`).
 * Multi-row changes (scoped edits, series splits, pot targets) run in one
 * transaction with the entry row locked.
 */

export type WriteFailure =
  'not_found' | 'invalid_reference' | 'scope_required' | 'no_occurrence' | 'over_budget'
export type WriteResult = { ok: true } | { ok: false; reason: WriteFailure }

type Tx = Parameters<Parameters<FluxiDb['transaction']>[0]>[0]

const db = () => fluxiDb.db()
const ok: WriteResult = { ok: true }
const fail = (reason: WriteFailure): WriteResult => ({ ok: false, reason })

/** Runs `write`, mapping a composite-FK refusal to `invalid_reference`. */
async function guarded(write: () => Promise<WriteResult>): Promise<WriteResult> {
  try {
    return await write()
  } catch (error) {
    if (isForeignKeyViolation(error)) return fail('invalid_reference')
    if (error instanceof ScopeError) return fail(error.reason)
    throw error
  }
}

/** Aborts a transaction with a domain failure (rolled back, then reported). */
class ScopeError extends Error {
  constructor(readonly reason: WriteFailure) {
    super(reason)
  }
}

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
      return ok
    }),
  )
}

/** The entry (locked for the transaction), its parts and every override. */
async function loadSeries(tx: Tx, userId: string, entryId: string): Promise<SeriesState | null> {
  const [row] = await tx
    .select()
    .from(entries)
    .where(and(eq(entries.id, entryId), eq(entries.userId, userId)))
    .for('update')
  if (row === undefined) return null
  const partRows = await tx
    .select()
    .from(entryParts)
    .where(and(eq(entryParts.entryId, entryId), eq(entryParts.userId, userId)))
    .orderBy(asc(entryParts.sort))
  const overrideRows = await tx
    .select()
    .from(entryOverrides)
    .where(and(eq(entryOverrides.entryId, entryId), eq(entryOverrides.userId, userId)))
  return {
    entry: {
      id: row.id,
      kind: row.kind,
      description: row.description,
      amountCents: row.amountCents,
      accountId: row.accountId,
      toAccountId: row.toAccountId,
      categoryId: row.categoryId,
      pot: row.pot,
      tags: row.tags,
      startMonth: monthFromDate(row.startMonth),
      day: row.day,
      recurrence: row.recurrence,
      installments: row.installments,
      endMonth: row.endMonth === null ? null : monthFromDate(row.endMonth),
    },
    parts: partRows.map((p) => ({
      id: p.id,
      entryId: p.entryId,
      label: p.label,
      bps: p.bps,
      day: p.day,
      nextMonth: p.nextMonth,
      sort: p.sort,
    })),
    overrides: overrideRows.map((o) => ({
      entryId: o.entryId,
      month: monthFromDate(o.month),
      amountCents: o.amountCents,
      day: o.day,
      skipped: o.skipped,
    })),
  }
}

async function writeEntryRow(tx: Tx, userId: string, entry: Entry): Promise<void> {
  await tx
    .update(entries)
    .set({ ...entryColumns(entry), updatedAt: sql`now()` })
    .where(and(eq(entries.id, entry.id), eq(entries.userId, userId)))
}

async function replaceParts(
  tx: Tx,
  userId: string,
  entryId: string,
  parts: readonly EntryPart[],
): Promise<void> {
  await tx
    .delete(entryParts)
    .where(and(eq(entryParts.entryId, entryId), eq(entryParts.userId, userId)))
  if (parts.length > 0) await tx.insert(entryParts).values(parts.map((p) => partRow(userId, p)))
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
  if (split !== undefined) {
    await tx.insert(entries).values({ id: split.id, userId, ...entryColumns(split) })
    const copied = result.parts.filter((p) => p.entryId === split.id)
    if (copied.length > 0) await tx.insert(entryParts).values(copied.map((p) => partRow(userId, p)))
  }
  await tx
    .delete(entryOverrides)
    .where(and(eq(entryOverrides.entryId, state.entry.id), eq(entryOverrides.userId, userId)))
  if (result.overrides.length > 0) {
    await tx.insert(entryOverrides).values(result.overrides.map((o) => overrideRow(userId, o)))
  }
}

function patchOf(state: SeriesState, month: Month, fields: EntryFields): OccurrencePatch {
  const patch: OccurrencePatch = {}
  if (fields.amountCents !== amountFor(state.entry, state.overrides, month))
    patch.amountCents = fields.amountCents
  if (fields.parts.length === 0 && fields.day !== dayFor(state.entry, state.overrides, month))
    patch.day = fields.day
  return patch
}

const isEmpty = (patch: OccurrencePatch) =>
  patch.amountCents === undefined && patch.day === undefined

export type OccurrenceEdit = { month: Month; scope: EditScope | null }

/**
 * Update an entry. Without `occurrence` (or for a non-recurring entry) every
 * field is replaced. With `occurrence` on a recurring entry, the series-level
 * fields (description, accounts, category, pot, tags, recurrence, parts) apply
 * to the series and an amount/day change on that occurrence goes through
 * {@link applyScopedEdit} with the given scope (`scope_required` without one).
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
      const parts = partsFromFields(entryId, fields)

      if (occurrence === null || state.entry.recurrence === 'none') {
        await writeEntryRow(tx, userId, entryFromFields(entryId, fields))
        await replaceParts(tx, userId, entryId, parts)
        return ok
      }

      if (!occursIn(state.entry, occurrence.month)) return fail('no_occurrence')
      const patch = patchOf(state, occurrence.month, fields)
      if (!isEmpty(patch) && occurrence.scope === null) return fail('scope_required')

      const series: Entry = {
        ...entryFromFields(entryId, fields),
        amountCents: state.entry.amountCents,
        day: fields.parts.length > 0 ? fields.day : state.entry.day,
        startMonth: state.entry.startMonth,
      }
      if (!occursIn(series, occurrence.month)) throw new ScopeError('no_occurrence')
      await writeEntryRow(tx, userId, series)
      await replaceParts(tx, userId, entryId, parts)
      if (isEmpty(patch) || occurrence.scope === null) return ok

      const next: SeriesState = { entry: series, parts, overrides: state.overrides }
      const result = applyScopedEdit(
        next,
        { month: occurrence.month, patch, scope: occurrence.scope },
        randomUUID,
      )
      await persistScopedEdit(tx, userId, next, result)
      return ok
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
        await writeEntryRow(tx, userId, { ...state.entry, day })
        return ok
      }
      if (dayFor(state.entry, state.overrides, month) === day) return ok
      if (scope === null) return fail('scope_required')
      const result = applyScopedEdit(state, { month, patch: { day }, scope }, randomUUID)
      await persistScopedEdit(tx, userId, state, result)
      return ok
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
        await tx.delete(entries).where(and(eq(entries.id, entryId), eq(entries.userId, userId)))
        return ok
      }
      if (occurrence === null || entry.recurrence === 'none' || occurrence.scope === 'all')
        return removeAll()
      const { month, scope } = occurrence
      if (!occursIn(entry, month)) return fail('no_occurrence')

      if (scope === 'one') {
        await tx
          .insert(entryOverrides)
          .values({ entryId, userId, month: monthToDate(month), skipped: true })
          .onConflictDoUpdate({
            target: [entryOverrides.entryId, entryOverrides.month],
            set: { skipped: true, updatedAt: sql`now()` },
            setWhere: eq(entryOverrides.userId, userId),
          })
        return ok
      }

      if (month === entry.startMonth) return removeAll()
      const ended: Entry =
        entry.recurrence === 'installments'
          ? { ...entry, installments: diffMonths(entry.startMonth, month) }
          : { ...entry, endMonth: addMonths(month, -1) }
      await writeEntryRow(tx, userId, ended)
      await tx
        .delete(entryOverrides)
        .where(
          and(
            eq(entryOverrides.entryId, entryId),
            eq(entryOverrides.userId, userId),
            gte(entryOverrides.month, monthToDate(month)),
          ),
        )
      return ok
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
