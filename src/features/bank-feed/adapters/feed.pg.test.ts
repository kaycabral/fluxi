import { fluxiDb, personalScope, seedUser, truncateFluxiTables } from '@/db'
import { accounts, banks, spaces } from '@/db/schema'
import { bankFeedAccounts, bankTransactions } from '@/db/schema-bank-feed'
import type { FeedAccountRow, FeedTransactionRow } from '@/features/bank-feed/core/pluggy'
import type { Scope } from '@/features/spaces/core/space'
import { requireEnv } from '@cbrl/env'
import { eq } from 'drizzle-orm'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { syncFeedAccount } from './feed.write'

const ANA = '11111111-1111-4111-8111-111111111111'
const BIA = '22222222-2222-4222-8222-222222222222'

let anaScope: Scope
let biaScope: Scope
const db = () => fluxiDb.db()
/**
 * The writer runs exactly as in the Edge Function: postgres.js, no prepared
 * statements, as the least-privileged `fluxi_sync` role (one connection, so
 * `set role` covers every statement of the suite).
 */
const asSync = postgres(requireEnv('POSTGRES_URL'), { prepare: false, max: 1 })
const sync = (scope: Scope, acc: FeedAccountRow, transactions: FeedTransactionRow[]) =>
  syncFeedAccount(asSync, scope, {
    source: 'pluggy',
    account: acc,
    transactions,
    coveredFrom: '2026-01-01',
  })

const account: FeedAccountRow = {
  externalId: 'ext-acc',
  itemId: 'item-1',
  institution: 'Banco X',
  name: 'Conta',
  type: 'BANK',
  subtype: 'CHECKING_ACCOUNT',
  balanceCents: 1000,
}
const tx = (externalId: string, over: Partial<FeedTransactionRow> = {}): FeedTransactionRow => ({
  externalId,
  date: '2026-10-01',
  amountCents: -500,
  description: 'x',
  status: 'POSTED',
  category: null,
  installmentNumber: null,
  totalInstallments: null,
  billMonth: null,
  ...over,
})

describe('bank feed sync (Postgres)', () => {
  beforeAll(async () => {
    await asSync`set role fluxi_sync`
  })
  beforeEach(async () => {
    await truncateFluxiTables(db())
    await seedUser(db(), { id: ANA, email: 'ana@example.test' })
    await seedUser(db(), { id: BIA, email: 'bia@example.test' })
    anaScope = await personalScope(db(), ANA)
    biaScope = await personalScope(db(), BIA)
  })
  afterAll(async () => {
    await truncateFluxiTables(db())
    await asSync.end()
  })

  it('fluxi_sync only reaches the feed tables', async () => {
    const [who] = await asSync<{ role: string }[]>`select current_user as role`
    expect(who?.role).toBe('fluxi_sync')
    await expect(asSync`select 1 from entries limit 1`).rejects.toThrow(/permission denied/)
    await expect(asSync`select 1 from profiles limit 1`).rejects.toThrow(/permission denied/)
    await expect(asSync`select 1 from auth.users limit 1`).rejects.toThrow(/permission denied/)
    await expect(asSync`delete from accounts`).rejects.toThrow(/permission denied/)
    await expect(asSync`select 1 from spaces limit 1`).rejects.toThrow(/permission denied/)
    await expect(asSync`delete from bank_feed_items`).rejects.toThrow(/permission denied/)
    expect(await asSync`select 1 from bank_transactions`).toHaveLength(0)
    expect(await asSync`select 1 from bank_feed_items`).toHaveLength(0)
  })

  it('stays invisible to the API roles (RLS without policies for them)', async () => {
    await sync(anaScope, account, [tx('a')])
    const asApi = postgres(requireEnv('POSTGRES_URL'), { prepare: false, max: 1 })
    try {
      await asApi`set role authenticated`
      expect(await asApi`select 1 from bank_transactions`).toHaveLength(0)
      expect(await asApi`select 1 from bank_feed_accounts`).toHaveLength(0)
    } finally {
      await asApi.end()
    }
  })

  it('upserts by external id, removes what disappeared and keeps users apart', async () => {
    expect(await sync(anaScope, account, [tx('a'), tx('b')])).toEqual({
      upserted: 2,
      removed: 0,
    })
    await sync(biaScope, account, [tx('a')])

    const second = await sync(anaScope, { ...account, balanceCents: 7 }, [
      tx('a', { status: 'PENDING', amountCents: -600 }),
    ])
    expect(second).toEqual({ upserted: 1, removed: 1 })

    const anaRows = await db()
      .select()
      .from(bankTransactions)
      .where(eq(bankTransactions.userId, ANA))
    expect(anaRows.map((r) => [r.externalId, r.status, r.amountCents])).toEqual([
      ['a', 'PENDING', -600],
    ])
    const feeds = await db().select().from(bankFeedAccounts)
    expect(feeds).toHaveLength(2)
    expect(feeds.find((f) => f.userId === ANA)?.balanceCents).toBe(7)
    expect(
      await db().select().from(bankTransactions).where(eq(bankTransactions.userId, BIA)),
    ).toHaveLength(1)

    expect(await sync(anaScope, account, [])).toEqual({
      upserted: 0,
      removed: 1,
    })
  })

  it('keeps spaces apart and refuses a space of another user', async () => {
    const business = await db()
      .insert(spaces)
      .values({ userId: ANA, name: 'Empresa', kind: 'business' })
      .returning()
    const work = { userId: ANA, spaceId: business[0]!.id }
    await sync(anaScope, account, [tx('a')])
    await sync(work, account, [tx('a'), tx('b')])
    const rows = await db().select().from(bankTransactions).where(eq(bankTransactions.userId, ANA))
    expect(rows.filter((r) => r.spaceId === anaScope.spaceId)).toHaveLength(1)
    expect(rows.filter((r) => r.spaceId === work.spaceId)).toHaveLength(2)
    const foreign = { userId: BIA, spaceId: anaScope.spaceId }
    await expect(sync(foreign, { ...account, externalId: 'new' }, [])).rejects.toThrow(
      /bank_feed_accounts_space_fk/,
    )
    // Not even through the upsert of an account that space already has.
    await expect(sync(foreign, account, [])).rejects.toThrow(/returned nothing/)
  })

  it('never removes history older than the covered window', async () => {
    await sync(anaScope, account, [tx('old', { date: '2025-06-01' }), tx('new')])
    expect(await sync(anaScope, account, [])).toEqual({ upserted: 0, removed: 1 })
    const rows = await db().select().from(bankTransactions).where(eq(bankTransactions.userId, ANA))
    expect(rows.map((r) => r.externalId)).toEqual(['old'])
  })

  it('keeps the mapping across syncs and only unmaps when the fluxi account goes', async () => {
    await sync(anaScope, account, [tx('a')])
    const [bank] = await db()
      .insert(banks)
      .values({ ...anaScope, name: 'B' })
      .returning()
    const [mapped] = await db()
      .insert(accounts)
      .values({ ...anaScope, bankId: bank!.id, name: 'C', type: 'checking' })
      .returning()
    await db()
      .update(bankFeedAccounts)
      .set({ accountId: mapped!.id })
      .where(eq(bankFeedAccounts.userId, ANA))

    await sync(anaScope, account, [tx('a')])
    const [kept] = await db()
      .select()
      .from(bankFeedAccounts)
      .where(eq(bankFeedAccounts.userId, ANA))
    expect(kept?.accountId).toBe(mapped!.id)

    await db().delete(accounts).where(eq(accounts.id, mapped!.id))
    const [unmapped] = await db()
      .select()
      .from(bankFeedAccounts)
      .where(eq(bankFeedAccounts.userId, ANA))
    expect(unmapped).toMatchObject({ accountId: null, ...anaScope })
    expect(
      await db().select().from(bankTransactions).where(eq(bankTransactions.userId, ANA)),
    ).toHaveLength(1)
  })
})
