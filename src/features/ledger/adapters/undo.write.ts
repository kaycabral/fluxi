import 'server-only'

import { entries, undoSnapshots } from '@/db/schema'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { db, fail, guarded, ok, type Tx, type WriteResult } from './write-base'

/**
 * "Desfazer" of the ledger writes, like Google Calendar's: every undoable
 * action records, in its own transaction and before it writes, the rows of the
 * entries it touches (`to_jsonb`, so every column comes back exactly as it
 * was); undoing deletes those entries (their parts, overrides and payments go
 * with them by cascade) and puts the recorded rows back.
 *
 * Only the last action of a user can be undone (one row per user), and only
 * for {@link UNDO_WINDOW}: the toast offering it lasts seconds, the rest is
 * slack for a slow network.
 */

const UNDO_WINDOW = sql`interval '2 minutes'`

/** A Postgres `uuid[]` literal (ids are uuids, validated or generated, and go as a parameter). */
const uuidArray = (ids: readonly string[]) => `{${ids.join(',')}}`

const RESTORE_ORDER = ['entries', 'entry_parts', 'entry_overrides', 'occurrence_payments'] as const

/** The rows of `table` belonging to the entries `ids`, as a jsonb array. */
const rowsOf = (table: (typeof RESTORE_ORDER)[number], userId: string, ids: string) =>
  sql`coalesce((select jsonb_agg(to_jsonb(t)) from ${sql.identifier(table)} t
    where t.user_id = ${userId}
      and t.${sql.identifier(table === 'entries' ? 'id' : 'entry_id')} = any(${ids}::uuid[])), '[]'::jsonb)`

/**
 * Record the entries `entryIds` as they are now, as the user's last undoable
 * action (replacing the previous one), and sweep every expired record. Call it
 * after the action's checks and before its first write; for entries the action
 * creates, after (`created`: none of them existed, the undo only removes them).
 * Returns the token the undo must bring back.
 */
export async function captureUndo(
  tx: Tx,
  userId: string,
  entryIds: readonly string[],
  { created = false }: { created?: boolean } = {},
): Promise<string> {
  const token = randomUUID()
  const ids = uuidArray(entryIds)
  const rows = (table: (typeof RESTORE_ORDER)[number]) =>
    created ? sql`'[]'::jsonb` : rowsOf(table, userId, ids)
  await tx.execute(sql`delete from undo_snapshots where created_at < now() - ${UNDO_WINDOW}`)
  await tx.execute(sql`
    insert into undo_snapshots
      (user_id, token, entry_ids, entries, entry_parts, entry_overrides, occurrence_payments)
    values (
      ${userId}, ${token}, ${ids}::uuid[],
      ${rows('entries')},
      ${rows('entry_parts')},
      ${rows('entry_overrides')},
      ${rows('occurrence_payments')}
    )
    on conflict (user_id) do update set
      token = excluded.token,
      entry_ids = excluded.entry_ids,
      entries = excluded.entries,
      entry_parts = excluded.entry_parts,
      entry_overrides = excluded.entry_overrides,
      occurrence_payments = excluded.occurrence_payments,
      created_at = now()`)
  return token
}

/** Add the entries an action created (a series split) to what its undo removes. */
export async function widenUndo(tx: Tx, userId: string, createdIds: readonly string[]) {
  if (createdIds.length === 0) return
  await tx
    .update(undoSnapshots)
    .set({
      entryIds: sql`(select array(select distinct unnest(${undoSnapshots.entryIds} || ${uuidArray(createdIds)}::uuid[])))`,
    })
    .where(eq(undoSnapshots.userId, userId))
}

/**
 * Undo the user's last action, if `token` is still it and still in the window
 * (`undo_expired` otherwise). The record is consumed: a second undo is refused.
 */
export async function undoLastAction(userId: string, token: string): Promise<WriteResult> {
  return guarded(() =>
    db().transaction(async (tx) => {
      const [record] = await tx
        .select({ entryIds: undoSnapshots.entryIds })
        .from(undoSnapshots)
        .where(
          and(
            eq(undoSnapshots.userId, userId),
            eq(undoSnapshots.token, token),
            sql`${undoSnapshots.createdAt} >= now() - ${UNDO_WINDOW}`,
          ),
        )
        .for('update')
      if (record === undefined) return fail('undo_expired')
      await tx
        .delete(entries)
        .where(and(eq(entries.userId, userId), inArray(entries.id, record.entryIds)))
      // Parents first: parts before the payments that point at them. Each
      // snapshot column is named after its table.
      for (const table of RESTORE_ORDER) {
        await tx.execute(sql`
          insert into ${sql.identifier(table)}
          select * from jsonb_populate_recordset(
            null::${sql.identifier(table)},
            (select ${sql.identifier(table)} from undo_snapshots where user_id = ${userId})
          ) where user_id = ${userId}`)
      }
      await tx.delete(undoSnapshots).where(eq(undoSnapshots.userId, userId))
      return ok
    }),
  )
}

/** Drop the user's undo record once its toast closed unused (`token` guards a newer one). */
export async function forgetUndo(userId: string, token: string): Promise<void> {
  await db()
    .delete(undoSnapshots)
    .where(and(eq(undoSnapshots.userId, userId), eq(undoSnapshots.token, token)))
}
