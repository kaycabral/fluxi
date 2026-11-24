import { fluxiDb, seedUser, truncateFluxiTables } from '@/db'
import { accounts, entries, userSettings } from '@/db/schema'
import { workspace } from '@/features/import/core/fixtures'
import { buildImportPlan } from '@/features/import/core/plan'
import { verifyLedger } from '@/features/import/core/verify'
import { eq, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readImportedLedger } from './import.read'
import { findUserIdByEmail, writeImport } from './import.write'

const ANA = '11111111-1111-4111-8111-111111111111'
const BIA = '22222222-2222-4222-8222-222222222222'

const db = () => fluxiDb.db()
const plan = buildImportPlan(workspace)
const run = (userId: string) => writeImport(db(), userId, { plan, source: workspace })

const TABLES = [
  'banks',
  'accounts',
  'categories',
  'entries',
  'entry_overrides',
  'occurrence_payments',
  'import_links',
  'import_raw',
] as const

async function countsFor(userId: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const table of TABLES) {
    const result = await db().execute<{ n: number }>(
      sql`select count(*)::int as n from ${sql.identifier(table)} where user_id = ${userId}`,
    )
    out[table] = result.rows[0]?.n ?? 0
  }
  return out
}

describe('Notion import (Postgres)', () => {
  beforeAll(async () => {
    await truncateFluxiTables(db())
  })
  beforeEach(async () => {
    await truncateFluxiTables(db())
    await seedUser(db(), { id: ANA, email: 'ana@example.test' })
    await seedUser(db(), { id: BIA, email: 'bia@example.test' })
  })
  afterAll(async () => {
    await fluxiDb.close()
  })

  it('finds the user by e-mail, case-insensitively', async () => {
    expect(await findUserIdByEmail(db(), 'ANA@example.test')).toBe(ANA)
    expect(await findUserIdByEmail(db(), 'nobody@example.test')).toBeNull()
  })

  it('writes the plan, archives every Notion row and verifies from the database', async () => {
    const before = await countsFor(ANA)
    const summary = await run(ANA)
    expect(summary).toMatchObject({
      removed: { entries: 0, categories: 0, accounts: 0, banks: 0 },
      banks: { created: 2, kept: 0 },
      accounts: { created: 2, kept: 0 },
      entries: plan.entries.length,
      payments: 2,
      links: 10,
      raw: 13 + 6 + 2 + 2,
    })
    const after = await countsFor(ANA)
    expect((after.categories ?? 0) - (before.categories ?? 0)).toBe(summary.categories.created)
    expect(after.import_raw).toBe(summary.raw + summary.categories.created)

    const [settings] = await db().select().from(userSettings).where(eq(userSettings.userId, ANA))
    expect(settings?.countFromMonth).toBe('2026-12-01')
    const archived = await db()
      .select({ archivedAt: accounts.archivedAt })
      .from(accounts)
      .where(eq(accounts.userId, ANA))
    expect(archived.filter((a) => a.archivedAt !== null)).toHaveLength(1)

    const written = await readImportedLedger(db(), ANA)
    const originals = plan.originals.map((f) => ({
      ...f,
      accountId: written.accountIds.get(f.accountId) ?? '',
    }))
    expect(verifyLedger(originals, written).divergences).toBe(0)
  })

  it('re-runs idempotently: same counts, no duplicates', async () => {
    await run(ANA)
    const first = await countsFor(ANA)
    const summary = await run(ANA)
    expect(summary.removed.entries).toBe(plan.entries.length)
    expect(await countsFor(ANA)).toEqual(first)
  })

  it('keeps an imported account the user used elsewhere, reusing it on re-run', async () => {
    await run(ANA)
    const [account] = await db().select().from(accounts).where(eq(accounts.userId, ANA)).limit(1)
    if (account === undefined) throw new Error('no account imported')
    await db().insert(entries).values({
      id: randomUUID(),
      userId: ANA,
      kind: 'expense',
      description: 'Manual',
      amountCents: 100,
      accountId: account.id,
      startMonth: '2026-12-01',
      day: 1,
      recurrence: 'none',
    })
    const summary = await run(ANA)
    expect(summary.removed.accounts).toBe(1)
    expect(summary.accounts).toEqual({ created: 1, kept: 1 })
    const ids = (
      await db().select({ id: accounts.id }).from(accounts).where(eq(accounts.userId, ANA))
    ).map((a) => a.id)
    expect(ids).toHaveLength(2)
    expect(ids).toContain(account.id)
    expect((await countsFor(ANA)).entries).toBe(plan.entries.length + 1)
  })

  it('never touches another user', async () => {
    await run(BIA)
    const bia = await countsFor(BIA)
    await run(ANA)
    await run(ANA)
    expect(await countsFor(BIA)).toEqual(bia)
    const anaEntries = await db()
      .select({ id: entries.id })
      .from(entries)
      .where(eq(entries.userId, ANA))
    expect(anaEntries).toHaveLength(plan.entries.length)
  })
})
