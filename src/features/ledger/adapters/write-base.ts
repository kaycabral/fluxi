import 'server-only'

import { entries, entryOverrides, entryParts } from '@/db/schema'
import type { WriteFailureReason } from '@/features/ledger/core/action-result'
import { monthFromDate } from '@/features/ledger/core/month'
import type { SeriesState } from '@/features/ledger/core/scoped-edit'
import { fluxiDb, type FluxiDb } from '@/lib/db'
import { isForeignKeyViolation } from '@cbrl/pg'
import { and, asc, eq } from 'drizzle-orm'
import { isFromBank } from './ledger.repo'
import { inScope, type Scope } from './scope-filter'

/** Shared plumbing of the ledger write adapters (results, transactions, the locked series). */

export type WriteFailure = WriteFailureReason
/** `undo`: the token of the action's "Desfazer" (see `undo.write.ts`), when it is undoable. */
export type WriteResult = { ok: true; undo?: string } | { ok: false; reason: WriteFailure }

export type Tx = Parameters<Parameters<FluxiDb['transaction']>[0]>[0]

export const db = () => fluxiDb.db()
export const ok: WriteResult = { ok: true }
export const undoable = (undo: string): WriteResult => ({ ok: true, undo })
export const fail = (reason: WriteFailure): WriteResult => ({ ok: false, reason })

/** Runs `write`, mapping a composite-FK refusal to `invalid_reference`. */
export async function guarded(write: () => Promise<WriteResult>): Promise<WriteResult> {
  try {
    return await write()
  } catch (error) {
    if (isForeignKeyViolation(error)) return fail('invalid_reference')
    if (error instanceof ScopeError) return fail(error.reason)
    throw error
  }
}

/** Aborts a transaction with a domain failure (rolled back, then reported). */
export class ScopeError extends Error {
  constructor(readonly reason: WriteFailure) {
    super(reason)
  }
}

/** The entry (locked for the transaction), its parts and every override. */
export async function loadSeries(
  tx: Tx,
  scope: Scope,
  entryId: string,
): Promise<SeriesState | null> {
  const [locked] = await tx
    .select({ row: entries, fromBank: isFromBank })
    .from(entries)
    .where(and(eq(entries.id, entryId), inScope(entries, scope)))
    .for('update', { of: entries })
  if (locked === undefined) return null
  const { row, fromBank } = locked
  const partRows = await tx
    .select()
    .from(entryParts)
    .where(and(eq(entryParts.entryId, entryId), inScope(entryParts, scope)))
    .orderBy(asc(entryParts.sort))
  const overrideRows = await tx
    .select()
    .from(entryOverrides)
    .where(and(eq(entryOverrides.entryId, entryId), inScope(entryOverrides, scope)))
  return {
    entry: {
      id: row.id,
      kind: row.kind,
      description: row.description,
      amountCents: row.amountCents,
      accountId: row.accountId,
      toAccountId: row.toAccountId,
      categoryId: row.categoryId,
      budgetGroup: row.budgetGroup,
      tags: row.tags,
      startMonth: monthFromDate(row.startMonth),
      day: row.day,
      recurrence: row.recurrence,
      repeatEvery: row.repeatEvery,
      monthBy: row.monthBy,
      installments: row.installments,
      endMonth: row.endMonth === null ? null : monthFromDate(row.endMonth),
      fromBank,
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
      deleted: o.deleted,
    })),
  }
}
