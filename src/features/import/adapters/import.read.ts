import type { FluxiDb } from '@/db'
import { entries, entryOverrides, importLinks, importRaw } from '@/db/schema'
import type { LedgerToVerify } from '@/features/import/core/verify'
import { monthFromDate } from '@/features/ledger/core/month'
import { and, eq, inArray } from 'drizzle-orm'
import { NOTION_SOURCE } from './import.write'

/**
 * Reads back what the Notion import wrote for one user (entries linked from
 * `import_links`, their overrides, and the Notion account → fluxi account map
 * from `import_raw`), so the script can verify the database itself.
 */

export type ImportedLedger = LedgerToVerify & { accountIds: Map<string, string> }

export async function readImportedLedger(db: FluxiDb, userId: string): Promise<ImportedLedger> {
  const linked = db
    .selectDistinct({ id: importLinks.entryId })
    .from(importLinks)
    .where(and(eq(importLinks.userId, userId), eq(importLinks.source, NOTION_SOURCE)))
  const entryRows = await db
    .select()
    .from(entries)
    .where(and(eq(entries.userId, userId), inArray(entries.id, linked)))
  const overrideRows = await db
    .select()
    .from(entryOverrides)
    .where(and(eq(entryOverrides.userId, userId), inArray(entryOverrides.entryId, linked)))
  const accountRows = await db
    .select({ externalId: importRaw.externalId, targetId: importRaw.targetId })
    .from(importRaw)
    .where(
      and(
        eq(importRaw.userId, userId),
        eq(importRaw.source, NOTION_SOURCE),
        eq(importRaw.kind, 'accounts'),
      ),
    )
  return {
    entries: entryRows.map((r) => ({
      id: r.id,
      kind: r.kind,
      description: r.description,
      amountCents: r.amountCents,
      accountId: r.accountId,
      toAccountId: r.toAccountId,
      categoryId: r.categoryId,
      pot: r.pot,
      tags: r.tags,
      startMonth: monthFromDate(r.startMonth),
      day: r.day,
      recurrence: r.recurrence,
      installments: r.installments,
      endMonth: r.endMonth === null ? null : monthFromDate(r.endMonth),
    })),
    overrides: overrideRows.map((r) => ({
      entryId: r.entryId,
      month: monthFromDate(r.month),
      amountCents: r.amountCents,
      day: r.day,
      skipped: r.skipped,
    })),
    accountIds: new Map(
      accountRows.flatMap((r) =>
        r.targetId === null ? [] : [[r.externalId, r.targetId] as const],
      ),
    ),
  }
}
