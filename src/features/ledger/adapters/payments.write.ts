import 'server-only'

import { occurrencePayments } from '@/db/schema'
import { monthFromDate, monthToDate } from '@/features/ledger/core/month'
import { isSkipped, occursIn } from '@/features/ledger/core/occurrence'
import {
  splitPayments,
  stalePayments,
  type OccurrencePayment,
  type PaymentKey,
} from '@/features/ledger/core/payments'
import type { SeriesState } from '@/features/ledger/core/scoped-edit'
import type { Entry, EntryPart } from '@/features/ledger/core/types'
import { and, eq, inArray, isNull, type SQL } from 'drizzle-orm'
import { captureUndo } from './undo.write'
import {
  db,
  fail,
  guarded,
  loadSeries,
  ok,
  undoable,
  type Tx,
  type WriteResult,
} from './write-base'

/**
 * "Pago/recebido" writes, and how the ledger writes keep payments consistent:
 * {@link syncPayments} drops payments that no longer match an occurrence after
 * an edit/delete, {@link movePaymentsToSplit} follows a `future` split. Every
 * statement filters by the session `userId`.
 */

type PaymentRow = OccurrencePayment & { id: string }

async function loadPayments(tx: Tx, userId: string, entryId: string): Promise<PaymentRow[]> {
  const rows = await tx
    .select()
    .from(occurrencePayments)
    .where(and(eq(occurrencePayments.entryId, entryId), eq(occurrencePayments.userId, userId)))
  return rows.map((r) => ({
    id: r.id,
    entryId: r.entryId,
    month: monthFromDate(r.month),
    partId: r.partId,
    paidOn: r.paidOn,
  }))
}

/** Delete the entry's payments that no longer match one of its occurrences. */
export async function syncPayments(tx: Tx, userId: string, entryId: string): Promise<void> {
  const state = await loadSeries(tx, userId, entryId)
  if (state === null) return
  const stale = stalePayments(
    state.entry,
    state.parts,
    state.overrides,
    await loadPayments(tx, userId, entryId),
  )
  if (stale.length === 0) return
  await tx.delete(occurrencePayments).where(
    and(
      eq(occurrencePayments.userId, userId),
      inArray(
        occurrencePayments.id,
        stale.map((p) => p.id),
      ),
    ),
  )
}

/** A `future` split moves the payments from its month on to the new entry. */
export async function movePaymentsToSplit(
  tx: Tx,
  userId: string,
  state: SeriesState,
  split: { entry: Entry; parts: readonly EntryPart[] },
): Promise<void> {
  const payments = await loadPayments(tx, userId, state.entry.id)
  const moved = splitPayments(
    payments,
    { fromEntryId: state.entry.id, toEntryId: split.entry.id, month: split.entry.startMonth },
    state.parts.filter((p) => p.entryId === state.entry.id),
    split.parts,
  )
  const kept = new Set(moved.map((p) => p.id))
  const lost = payments.filter((p) => !kept.has(p.id)).map((p) => p.id)
  if (lost.length > 0) {
    await tx
      .delete(occurrencePayments)
      .where(and(eq(occurrencePayments.userId, userId), inArray(occurrencePayments.id, lost)))
  }
  for (const payment of moved) {
    if (payment.entryId === state.entry.id) continue
    await tx
      .update(occurrencePayments)
      .set({ entryId: payment.entryId, partId: payment.partId })
      .where(and(eq(occurrencePayments.id, payment.id), eq(occurrencePayments.userId, userId)))
  }
}

const samePart = (partId: string | null): SQL =>
  partId === null ? isNull(occurrencePayments.partId) : eq(occurrencePayments.partId, partId)

/**
 * Mark an occurrence (or one part of a split occurrence) paid on `paidOn`.
 * Idempotent: marking again only updates the date. Refused (`no_occurrence`)
 * when the entry has no such occurrence/part — a skipped month, a part of
 * another entry, the whole occurrence of a split entry.
 */
export async function markOccurrencePaid(
  userId: string,
  input: PaymentKey & { paidOn: string },
): Promise<WriteResult> {
  return guarded(() =>
    db().transaction(async (tx) => {
      const { entryId, month, partId, paidOn } = input
      const state = await loadSeries(tx, userId, entryId)
      if (state === null) return fail('not_found')
      if (!occursIn(state.entry, month) || isSkipped(state.entry, state.overrides, month))
        return fail('no_occurrence')
      const validPart =
        partId === null ? state.parts.length === 0 : state.parts.some((p) => p.id === partId)
      if (!validPart) return fail('no_occurrence')
      const undo = await captureUndo(tx, userId, [entryId])
      await tx
        .insert(occurrencePayments)
        .values({ userId, entryId, month: monthToDate(month), partId, paidOn })
        .onConflictDoUpdate({
          target: [occurrencePayments.entryId, occurrencePayments.month, occurrencePayments.partId],
          set: { paidOn },
          setWhere: eq(occurrencePayments.userId, userId),
        })
      return undoable(undo)
    }),
  )
}

/** Undo {@link markOccurrencePaid}. Idempotent; another user's payment is never touched. */
export async function unmarkOccurrencePaid(
  userId: string,
  input: PaymentKey,
): Promise<WriteResult> {
  const payment = and(
    eq(occurrencePayments.userId, userId),
    eq(occurrencePayments.entryId, input.entryId),
    eq(occurrencePayments.month, monthToDate(input.month)),
    samePart(input.partId),
  )
  return db().transaction(async (tx) => {
    const [paid] = await tx
      .select({ id: occurrencePayments.id })
      .from(occurrencePayments)
      .where(payment)
      .for('update')
    // Not paid (or not this user's): nothing to unmark, nothing to undo.
    if (paid === undefined) return ok
    const undo = await captureUndo(tx, userId, [input.entryId])
    await tx.delete(occurrencePayments).where(payment)
    return undoable(undo)
  })
}
