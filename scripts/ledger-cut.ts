// Cut a user's ledger history at a month (production step of the bank feed
// integration: from the cut on, the past is the bank's). See
// docs/production.md, "Integração do feed bancário ao ledger".
//
//   pnpm ledger:cut -- --user <uuid> [--cut 2026-12] [--apply]
//
// Targets `POSTGRES_URL` when set, else the LOCAL Supabase stack. Dry-run by
// default: everything runs inside one transaction, the verification queries
// run, and the transaction is rolled back. `--apply` commits it. Prints
// aggregates only (counts), never descriptions or amounts.
//
// Per entry (`planCut`, src/features/ledger/core/cut.ts): one-offs before the
// cut are deleted; series that started before it start at their first
// occurrence from the cut (installments keep only the remaining ones with
// their slice of the total, like `endSeriesBefore`); overrides and payments of
// months before the cut are deleted. Bank-linked entries are never touched.

import { fluxiDb } from '@/db'
import { entries, entryOverrides, occurrencePayments, spaces } from '@/db/schema'
import { bankEntryLinks } from '@/db/schema-bank-feed'
import { planCut } from '@/features/ledger/core/cut'
import { monthFromDate, monthToDate, type Month } from '@/features/ledger/core/month'
import type { Entry } from '@/features/ledger/core/types'
import { readLocalSupabase } from '@cbrl/supabase/local'
import { and, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    user: { type: 'string' },
    cut: { type: 'string', default: '2026-12' },
    apply: { type: 'boolean', default: false },
  },
})

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

const targetUrl = process.env.POSTGRES_URL || readLocalSupabase().dbUrl
process.env.POSTGRES_URL = targetUrl

class DryRun extends Error {}

type Tx = Parameters<Parameters<ReturnType<typeof fluxiDb.db>['transaction']>[0]>[0]

function toEntry(row: typeof entries.$inferSelect): Entry {
  return {
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
    repeatEvery: row.repeatEvery,
    monthBy: row.monthBy,
    installments: row.installments,
    endMonth: row.endMonth === null ? null : monthFromDate(row.endMonth),
  }
}

async function counts(tx: Tx, userId: string, cut: Month) {
  const cutDate = monthToDate(cut)
  const [row] = await tx
    .execute<{
      entries: number
      before: number
      overrides_before: number
      payments_before: number
    }>(
      sql`
    select
      (select count(*)::int from entries where user_id = ${userId}) as entries,
      (select count(*)::int from entries e where e.user_id = ${userId} and e.start_month < ${cutDate}
        and not exists (select 1 from bank_entry_links l where l.entry_id = e.id)) as before,
      (select count(*)::int from entry_overrides where user_id = ${userId} and month < ${cutDate})
        as overrides_before,
      (select count(*)::int from occurrence_payments p where p.user_id = ${userId} and p.month < ${cutDate}
        and not exists (select 1 from bank_entry_links l where l.entry_id = p.entry_id)) as payments_before`,
    )
    .then((r) => r.rows)
  if (row === undefined) throw new Error('count query returned nothing')
  return row
}

async function main(): Promise<number> {
  const userId = values.user ?? ''
  const cut = values.cut ?? ''
  if (!UUID.test(userId) || !MONTH.test(cut)) {
    console.error('usage: pnpm ledger:cut -- --user <uuid> [--cut YYYY-MM] [--apply]')
    return 2
  }
  const url = new URL(targetUrl)
  console.log(`target ${url.hostname}:${url.port || '5432'}${url.pathname}, cut ${cut}`)
  console.log(values.apply ? 'mode: APPLY' : 'mode: dry-run (rolled back)')

  const db = fluxiDb.db()
  try {
    await db.transaction(async (tx) => {
      const before = await counts(tx, userId, cut)
      console.log(
        `before: ${before.entries} entries, ${before.before} start before the cut, ${before.overrides_before} overrides and ${before.payments_before} payments before it`,
      )
      const spaceRows = await tx
        .select({ id: spaces.id })
        .from(spaces)
        .where(eq(spaces.userId, userId))
      let deleted = 0
      let moved = 0
      for (const space of spaceRows) {
        const rows = await tx
          .select()
          .from(entries)
          .where(and(eq(entries.userId, userId), eq(entries.spaceId, space.id)))
          .for('update')
        const linked = await tx
          .selectDistinct({ entryId: bankEntryLinks.entryId })
          .from(bankEntryLinks)
          .where(
            and(
              eq(bankEntryLinks.userId, userId),
              eq(bankEntryLinks.spaceId, space.id),
              isNotNull(bankEntryLinks.entryId),
            ),
          )
        const protectedIds = new Set(linked.flatMap((l) => (l.entryId === null ? [] : [l.entryId])))
        const plan = planCut(rows.map(toEntry), cut, protectedIds)
        if (plan.deleted.length > 0) {
          await tx
            .delete(entries)
            .where(
              and(
                eq(entries.userId, userId),
                eq(entries.spaceId, space.id),
                inArray(entries.id, plan.deleted),
              ),
            )
        }
        for (const entry of plan.moved) {
          await tx
            .update(entries)
            .set({
              startMonth: monthToDate(entry.startMonth),
              installments: entry.installments,
              amountCents: entry.amountCents,
              updatedAt: sql`now()`,
            })
            .where(
              and(
                eq(entries.id, entry.id),
                eq(entries.userId, userId),
                eq(entries.spaceId, space.id),
              ),
            )
        }
        deleted += plan.deleted.length
        moved += plan.moved.length
      }
      const notLinked = sql`not exists (select 1 from bank_entry_links l where l.entry_id = ${entryOverrides.entryId})`
      await tx
        .delete(entryOverrides)
        .where(
          and(
            eq(entryOverrides.userId, userId),
            lt(entryOverrides.month, monthToDate(cut)),
            notLinked,
          ),
        )
      await tx
        .delete(occurrencePayments)
        .where(
          and(
            eq(occurrencePayments.userId, userId),
            lt(occurrencePayments.month, monthToDate(cut)),
            sql`not exists (select 1 from bank_entry_links l where l.entry_id = ${occurrencePayments.entryId})`,
          ),
        )

      const after = await counts(tx, userId, cut)
      console.log(`cut: ${deleted} entries deleted, ${moved} series moved to start at ${cut}`)
      console.log(
        `after: ${after.entries} entries, ${after.before} start before the cut, ${after.overrides_before} overrides and ${after.payments_before} payments before it`,
      )
      if (after.before !== 0 || after.payments_before !== 0) {
        throw new Error('verification failed: history before the cut remains (rolled back)')
      }
      if (!values.apply) throw new DryRun()
    })
  } catch (error) {
    if (error instanceof DryRun) {
      console.log('dry-run: rolled back; re-run with --apply to commit')
      return 0
    }
    throw error
  }
  console.log('applied')
  return 0
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'ledger cut failed')
    process.exitCode = 1
  })
  .finally(() => fluxiDb.close())
