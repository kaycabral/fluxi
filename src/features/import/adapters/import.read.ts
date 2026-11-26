import type { FluxiDb } from '@/db'
import { entries, entryOverrides, importLinks, importRaw } from '@/db/schema'
import type { LedgerToVerify } from '@/features/import/core/verify'
import { inScope, type Scope } from '@/features/ledger/adapters/scope-filter'
import { monthFromDate } from '@/features/ledger/core/month'
import { and, eq, inArray } from 'drizzle-orm'
import { NOTION_SOURCE } from './import.write'

/**
 * Reads back what the Notion import wrote for one user (entries linked from
 * `import_links`, their overrides, and the Notion account → fluxi account map
 * from `import_raw`), so the script can verify the database itself.
 */

export type ImportedLedger = LedgerToVerify & { accountIds: Map<string, string> }

export async function readImportedLedger(db: FluxiDb, scope: Scope): Promise<ImportedLedger> {
  const linked = db
    .selectDistinct({ id: importLinks.entryId })
    .from(importLinks)
    .where(and(inScope(importLinks, scope), eq(importLinks.source, NOTION_SOURCE)))
  const entryRows = await db
    .select()
    .from(entries)
    .where(and(inScope(entries, scope), inArray(entries.id, linked)))
  const overrideRows = await db
    .select()
    .from(entryOverrides)
    .where(and(inScope(entryOverrides, scope), inArray(entryOverrides.entryId, linked)))
  const accountRows = await db
    .select({ externalId: importRaw.externalId, targetId: importRaw.targetId })
    .from(importRaw)
    .where(
      and(
        inScope(importRaw, scope),
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
      budgetGroup: r.budgetGroup,
      tags: r.tags,
      startMonth: monthFromDate(r.startMonth),
      day: r.day,
      recurrence: r.recurrence,
      repeatEvery: r.repeatEvery,
      monthBy: r.monthBy,
      installments: r.installments,
      endMonth: r.endMonth === null ? null : monthFromDate(r.endMonth),
      fromBank: false,
      merchantName: null,
    })),
    overrides: overrideRows.map((r) => ({
      entryId: r.entryId,
      month: monthFromDate(r.month),
      amountCents: r.amountCents,
      day: r.day,
      skipped: r.skipped,
      deleted: r.deleted,
    })),
    accountIds: new Map(
      accountRows.flatMap((r) =>
        r.targetId === null ? [] : [[r.externalId, r.targetId] as const],
      ),
    ),
  }
}
