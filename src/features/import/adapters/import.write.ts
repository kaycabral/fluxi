import type { FluxiDb } from '@/db'
import {
  accounts,
  banks,
  categories,
  entries,
  entryOverrides,
  importLinks,
  importRaw,
  occurrencePayments,
  userSettings,
} from '@/db/schema'
import { NOTION_KINDS, type NotionSource } from '@/features/import/core/notion'
import { COUNT_FROM_MONTH, type ImportPlan } from '@/features/import/core/plan'
import { monthToDate } from '@/features/ledger/core/month'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

/**
 * Write side of the Notion import. {@link writeImport} runs in ONE
 * transaction: it first removes everything a previous run of the same source
 * created for the user (linked entries with their overrides/payments, and the
 * banks/accounts/categories it created that nothing else uses), then inserts
 * the plan and the raw archive. Every statement is scoped by `userId`.
 */

export const NOTION_SOURCE = 'notion'
export const CATEGORY_KIND = 'category'

type Tx = Parameters<Parameters<FluxiDb['transaction']>[0]>[0]
type Executor = FluxiDb | Tx

export type RemovedCounts = { entries: number; categories: number; accounts: number; banks: number }

export type WriteSummary = {
  removed: RemovedCounts
  banks: { created: number; kept: number }
  accounts: { created: number; kept: number }
  categories: { created: number; reused: number }
  entries: number
  overrides: number
  payments: number
  links: number
  raw: number
}

const CHUNK = 250

async function inChunks<T>(rows: readonly T[], write: (chunk: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += CHUNK) await write(rows.slice(i, i + CHUNK))
}

const categoryExternalId = (groupName: string, name: string) => `${groupName} › ${name}`

export async function findUserIdByEmail(db: FluxiDb, email: string): Promise<string | null> {
  const result = await db.execute<{ id: string }>(
    sql`select id from auth.users where lower(email) = lower(${email}) limit 1`,
  )
  return result.rows[0]?.id ?? null
}

/** Existing categories of the user, by `group\u0000name`. */
export async function categoryIdsByKey(db: Executor, userId: string): Promise<Map<string, string>> {
  const rows = await db
    .select({ id: categories.id, groupName: categories.groupName, name: categories.name })
    .from(categories)
    .where(eq(categories.userId, userId))
  return new Map(rows.map((r) => [`${r.groupName}\u0000${r.name}`, r.id]))
}

/** fluxi ids created by previous runs, by kind (`banks`, `accounts`, `category`) → external id. */
async function priorTargets(tx: Tx, userId: string): Promise<Map<string, Map<string, string>>> {
  const rows = await tx
    .select({
      kind: importRaw.kind,
      externalId: importRaw.externalId,
      targetId: importRaw.targetId,
    })
    .from(importRaw)
    .where(and(eq(importRaw.userId, userId), eq(importRaw.source, NOTION_SOURCE)))
  const out = new Map<string, Map<string, string>>()
  for (const r of rows) {
    if (r.targetId === null) continue
    const byExternal = out.get(r.kind) ?? new Map<string, string>()
    byExternal.set(r.externalId, r.targetId)
    out.set(r.kind, byExternal)
  }
  return out
}

const idsOf = (prior: Map<string, Map<string, string>>, kind: string) => [
  ...(prior.get(kind)?.values() ?? []),
]

async function removePrevious(
  tx: Tx,
  userId: string,
  prior: Map<string, Map<string, string>>,
): Promise<RemovedCounts> {
  const linked = tx
    .select({ id: importLinks.entryId })
    .from(importLinks)
    .where(and(eq(importLinks.userId, userId), eq(importLinks.source, NOTION_SOURCE)))
  const removedEntries = await tx
    .delete(entries)
    .where(and(eq(entries.userId, userId), inArray(entries.id, linked)))
    .returning({ id: entries.id })
  const unused = async (
    table: 'categories' | 'accounts' | 'banks',
    ids: string[],
    usedBy: ReturnType<typeof sql>,
  ) => {
    if (ids.length === 0) return 0
    const result = await tx.execute(sql`
      delete from ${sql.identifier(table)} t
      where t.user_id = ${userId} and t.id in ${sql`(${sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`}
        and not exists (${usedBy})`)
    return result.rowCount ?? 0
  }
  const removed: RemovedCounts = {
    entries: removedEntries.length,
    categories: await unused(
      'categories',
      idsOf(prior, CATEGORY_KIND),
      sql`select 1 from entries e where e.category_id = t.id`,
    ),
    accounts: await unused(
      'accounts',
      idsOf(prior, 'accounts'),
      sql`select 1 from entries e where e.account_id = t.id or e.to_account_id = t.id`,
    ),
    banks: await unused(
      'banks',
      idsOf(prior, 'banks'),
      sql`select 1 from accounts a where a.bank_id = t.id`,
    ),
  }
  await tx
    .delete(importLinks)
    .where(and(eq(importLinks.userId, userId), eq(importLinks.source, NOTION_SOURCE)))
  await tx
    .delete(importRaw)
    .where(and(eq(importRaw.userId, userId), eq(importRaw.source, NOTION_SOURCE)))
  return removed
}

async function existingIds(
  tx: Tx,
  table: typeof banks | typeof accounts,
  userId: string,
  ids: string[],
) {
  if (ids.length === 0) return new Set<string>()
  const rows = await tx
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.userId, userId), inArray(table.id, ids)))
  return new Set(rows.map((r) => r.id))
}

type IdMaps = {
  bank: Map<string, string>
  account: Map<string, string>
  category: Map<string, string>
}

async function writeBanks(tx: Tx, userId: string, plan: ImportPlan, prior: Map<string, string>) {
  const kept = await existingIds(tx, banks, userId, [...prior.values()])
  const ids = new Map<string, string>()
  const inserts = []
  for (const bank of plan.banks) {
    const previous = prior.get(bank.externalId)
    const archivedAt = bank.archived ? new Date() : null
    if (previous !== undefined && kept.has(previous)) {
      ids.set(bank.externalId, previous)
      await tx
        .update(banks)
        .set({ name: bank.name, sort: bank.sort, archivedAt, updatedAt: new Date() })
        .where(and(eq(banks.id, previous), eq(banks.userId, userId)))
      continue
    }
    const id = randomUUID()
    ids.set(bank.externalId, id)
    inserts.push({ id, userId, name: bank.name, sort: bank.sort, archivedAt })
  }
  await inChunks(inserts, (chunk) => tx.insert(banks).values(chunk))
  return { ids, created: inserts.length, kept: plan.banks.length - inserts.length }
}

async function writeAccounts(
  tx: Tx,
  userId: string,
  plan: ImportPlan,
  ctx: { prior: Map<string, string>; bankIds: Map<string, string> },
) {
  const kept = await existingIds(tx, accounts, userId, [...ctx.prior.values()])
  const ids = new Map<string, string>()
  const inserts = []
  for (const account of plan.accounts) {
    const previous = ctx.prior.get(account.externalId)
    const fields = {
      bankId: ctx.bankIds.get(account.bankExternalId) ?? '',
      name: account.name,
      type: account.type,
      archivedAt: account.archived ? new Date() : null,
    }
    if (previous !== undefined && kept.has(previous)) {
      ids.set(account.externalId, previous)
      await tx
        .update(accounts)
        .set({ ...fields, updatedAt: new Date() })
        .where(and(eq(accounts.id, previous), eq(accounts.userId, userId)))
      continue
    }
    const id = randomUUID()
    ids.set(account.externalId, id)
    inserts.push({ id, userId, openingBalanceCents: 0, ...fields })
  }
  await inChunks(inserts, (chunk) => tx.insert(accounts).values(chunk))
  return { ids, created: inserts.length, kept: plan.accounts.length - inserts.length }
}

/** Reuses categories by (group, name); creates the missing ones. */
async function writeCategories(
  tx: Tx,
  userId: string,
  plan: ImportPlan,
  prior: Map<string, string>,
) {
  const existing = await categoryIdsByKey(tx, userId)
  const priorIds = new Set(prior.values())
  const ids = new Map<string, string>()
  const created: { externalId: string; id: string; groupName: string; name: string }[] = []
  const inserts = []
  for (const category of plan.categories) {
    const found = existing.get(category.key)
    const id = found ?? randomUUID()
    ids.set(category.key, id)
    if (found === undefined) {
      inserts.push({
        id,
        userId,
        groupName: category.groupName,
        name: category.name,
        defaultPot: category.defaultPot,
        sort: 1000,
      })
    }
    if (found === undefined || priorIds.has(found)) {
      created.push({
        externalId: categoryExternalId(category.groupName, category.name),
        id,
        groupName: category.groupName,
        name: category.name,
      })
    }
  }
  await inChunks(inserts, (chunk) => tx.insert(categories).values(chunk))
  return { ids, created, reused: plan.categories.length - created.length }
}

async function writeLedger(tx: Tx, userId: string, plan: ImportPlan, maps: IdMaps) {
  const entryIds = new Map(plan.entries.map((e) => [e.key, randomUUID()]))
  const idOf = (key: string) => entryIds.get(key) ?? ''
  const entryRows = plan.entries.map((e) => ({
    id: idOf(e.key),
    userId,
    kind: e.kind,
    description: e.description,
    amountCents: e.amountCents,
    accountId: maps.account.get(e.accountId) ?? '',
    toAccountId: e.toAccountId === null ? null : (maps.account.get(e.toAccountId) ?? ''),
    categoryId: e.categoryKey === null ? null : (maps.category.get(e.categoryKey) ?? null),
    pot: e.pot,
    tags: [...e.tags],
    startMonth: monthToDate(e.startMonth),
    day: e.day,
    recurrence: e.recurrence,
    endMonth: e.endMonth === null ? null : monthToDate(e.endMonth),
  }))
  const overrideRows = plan.entries.flatMap((e) =>
    e.overrides.map((o) => ({ entryId: idOf(e.key), userId, ...o, month: monthToDate(o.month) })),
  )
  const paymentRows = plan.payments.map((p) => ({
    userId,
    entryId: idOf(p.entryKey),
    month: monthToDate(p.month),
    paidOn: p.paidOn,
  }))
  const linkRows = plan.links.map((l) => ({
    userId,
    source: NOTION_SOURCE,
    externalId: l.externalId,
    entryId: idOf(l.entryKey),
    month: monthToDate(l.month),
  }))
  await inChunks(entryRows, (chunk) => tx.insert(entries).values(chunk))
  await inChunks(overrideRows, (chunk) => tx.insert(entryOverrides).values(chunk))
  await inChunks(paymentRows, (chunk) => tx.insert(occurrencePayments).values(chunk))
  await inChunks(linkRows, (chunk) => tx.insert(importLinks).values(chunk))
  return {
    entries: entryRows.length,
    overrides: overrideRows.length,
    payments: paymentRows.length,
    links: linkRows.length,
  }
}

type CreatedCategory = { externalId: string; id: string; groupName: string; name: string }

async function writeRaw(
  tx: Tx,
  userId: string,
  source: NotionSource,
  ctx: { maps: IdMaps; createdCategories: CreatedCategory[] },
) {
  const targets: Partial<Record<string, Map<string, string>>> = {
    banks: ctx.maps.bank,
    accounts: ctx.maps.account,
  }
  const targetOf = (kind: string, id: string) => targets[kind]?.get(id)
  const rows = NOTION_KINDS.flatMap((kind) =>
    source[kind].map((page) => ({
      userId,
      source: NOTION_SOURCE,
      kind,
      externalId: page.id,
      payload: page,
      targetId: targetOf(kind, page.id) ?? null,
    })),
  )
  const categoryRows = ctx.createdCategories.map((c) => ({
    userId,
    source: NOTION_SOURCE,
    kind: CATEGORY_KIND,
    externalId: c.externalId,
    payload: { groupName: c.groupName, name: c.name },
    targetId: c.id,
  }))
  await inChunks([...rows, ...categoryRows], (chunk) => tx.insert(importRaw).values(chunk))
  return rows.length
}

/** Replaces the user's previous Notion import with `plan` (one transaction). */
export async function writeImport(
  db: FluxiDb,
  userId: string,
  input: { plan: ImportPlan; source: NotionSource },
): Promise<WriteSummary> {
  const { plan, source } = input
  return db.transaction(async (tx) => {
    const prior = await priorTargets(tx, userId)
    const removed = await removePrevious(tx, userId, prior)
    const bankResult = await writeBanks(
      tx,
      userId,
      plan,
      prior.get('banks') ?? new Map<string, string>(),
    )
    const accountResult = await writeAccounts(tx, userId, plan, {
      prior: prior.get('accounts') ?? new Map<string, string>(),
      bankIds: bankResult.ids,
    })
    const categoryResult = await writeCategories(
      tx,
      userId,
      plan,
      prior.get(CATEGORY_KIND) ?? new Map<string, string>(),
    )
    const maps: IdMaps = {
      bank: bankResult.ids,
      account: accountResult.ids,
      category: categoryResult.ids,
    }
    const ledger = await writeLedger(tx, userId, plan, maps)
    const raw = await writeRaw(tx, userId, source, {
      maps,
      createdCategories: categoryResult.created,
    })
    const countFrom = monthToDate(COUNT_FROM_MONTH)
    await tx
      .insert(userSettings)
      .values({ userId, countFromMonth: countFrom })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { countFromMonth: countFrom, updatedAt: new Date() },
      })
    return {
      removed,
      banks: { created: bankResult.created, kept: bankResult.kept },
      accounts: { created: accountResult.created, kept: accountResult.kept },
      categories: { created: categoryResult.created.length, reused: categoryResult.reused },
      ...ledger,
      raw,
    }
  })
}
