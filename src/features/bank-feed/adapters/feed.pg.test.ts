import { fluxiDb, seedUser, truncateFluxiTables } from '@/db'
import { accounts, bankFeedAccounts, bankTransactions, banks } from '@/db/schema'
import type { FeedAccountRow, FeedTransactionRow } from '@/features/bank-feed/core/pluggy'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { syncFeedAccount } from './feed.write'

const ANA = '11111111-1111-4111-8111-111111111111'
const BIA = '22222222-2222-4222-8222-222222222222'
const db = () => fluxiDb.db()
const sync = (userId: string, acc: FeedAccountRow, transactions: FeedTransactionRow[]) =>
  syncFeedAccount(db(), userId, {
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
  beforeEach(async () => {
    await truncateFluxiTables(db())
    await seedUser(db(), { id: ANA, email: 'ana@example.test' })
    await seedUser(db(), { id: BIA, email: 'bia@example.test' })
  })
  afterAll(async () => {
    await truncateFluxiTables(db())
  })

  it('upserts by external id, removes what disappeared and keeps users apart', async () => {
    expect(await sync(ANA, account, [tx('a'), tx('b')])).toEqual({
      upserted: 2,
      removed: 0,
    })
    await sync(BIA, account, [tx('a')])

    const second = await sync(ANA, { ...account, balanceCents: 7 }, [
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

    expect(await sync(ANA, account, [])).toEqual({
      upserted: 0,
      removed: 1,
    })
  })

  it('never removes history older than the covered window', async () => {
    await sync(ANA, account, [tx('old', { date: '2025-06-01' }), tx('new')])
    expect(await sync(ANA, account, [])).toEqual({ upserted: 0, removed: 1 })
    const rows = await db().select().from(bankTransactions).where(eq(bankTransactions.userId, ANA))
    expect(rows.map((r) => r.externalId)).toEqual(['old'])
  })

  it('keeps the mapping across syncs and only unmaps when the fluxi account goes', async () => {
    await sync(ANA, account, [tx('a')])
    const [bank] = await db().insert(banks).values({ userId: ANA, name: 'B' }).returning()
    const [mapped] = await db()
      .insert(accounts)
      .values({ userId: ANA, bankId: bank!.id, name: 'C', type: 'checking' })
      .returning()
    await db()
      .update(bankFeedAccounts)
      .set({ accountId: mapped!.id })
      .where(eq(bankFeedAccounts.userId, ANA))

    await sync(ANA, account, [tx('a')])
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
    expect(unmapped).toMatchObject({ accountId: null, userId: ANA })
    expect(
      await db().select().from(bankTransactions).where(eq(bankTransactions.userId, ANA)),
    ).toHaveLength(1)
  })
})
