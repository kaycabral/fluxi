import type { FluxiDb } from '@/db'
import { bankFeedAccounts, bankTransactions } from '@/db/schema'
import type { FeedAccountRow, FeedTransactionRow } from '@/features/bank-feed/core/pluggy'
import { and, eq, notInArray, sql } from 'drizzle-orm'

/**
 * Write side of the bank feed. {@link syncFeedAccount} replaces, in one
 * transaction, the stored copy of ONE external account with what the source
 * returned now: upsert of the account and of every transaction by external id,
 * then removal of the transactions the source no longer returns (pending ones
 * that settled under a new id, reversals). The user's mapping onto a fluxi
 * account is never touched. Every statement is scoped by `userId`.
 */

const CHUNK = 250

export type SyncCounts = { upserted: number; removed: number }

export type FeedSnapshot = {
  source: string
  account: FeedAccountRow
  transactions: readonly FeedTransactionRow[]
}

export async function syncFeedAccount(
  db: FluxiDb,
  userId: string,
  { source, account, transactions }: FeedSnapshot,
): Promise<SyncCounts> {
  const syncedAt = new Date()
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(bankFeedAccounts)
      .values({ ...account, userId, source, syncedAt })
      .onConflictDoUpdate({
        target: [bankFeedAccounts.userId, bankFeedAccounts.source, bankFeedAccounts.externalId],
        set: {
          itemId: account.itemId,
          institution: account.institution,
          name: account.name,
          type: account.type,
          subtype: account.subtype,
          balanceCents: account.balanceCents,
          syncedAt,
          updatedAt: syncedAt,
        },
      })
      .returning({ id: bankFeedAccounts.id })
    if (!row) throw new Error('bank feed account upsert returned nothing')
    const feedAccountId = row.id

    for (let i = 0; i < transactions.length; i += CHUNK) {
      const chunk = transactions.slice(i, i + CHUNK)
      await tx
        .insert(bankTransactions)
        .values(chunk.map((t) => ({ ...t, userId, feedAccountId, syncedAt })))
        .onConflictDoUpdate({
          target: [
            bankTransactions.userId,
            bankTransactions.feedAccountId,
            bankTransactions.externalId,
          ],
          set: {
            date: sql`excluded.date`,
            amountCents: sql`excluded.amount_cents`,
            description: sql`excluded.description`,
            status: sql`excluded.status`,
            category: sql`excluded.category`,
            installmentNumber: sql`excluded.installment_number`,
            totalInstallments: sql`excluded.total_installments`,
            billMonth: sql`excluded.bill_month`,
            syncedAt,
            updatedAt: syncedAt,
          },
        })
    }

    const scope = and(
      eq(bankTransactions.userId, userId),
      eq(bankTransactions.feedAccountId, feedAccountId),
    )
    const keep = transactions.map((t) => t.externalId)
    const removed = await tx
      .delete(bankTransactions)
      .where(keep.length > 0 ? and(scope, notInArray(bankTransactions.externalId, keep)) : scope)
      .returning({ id: bankTransactions.id })
    return { upserted: transactions.length, removed: removed.length }
  })
}
