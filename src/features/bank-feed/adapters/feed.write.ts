import type { Sql } from 'postgres'
import type { FeedAccountRow, FeedTransactionRow } from '../core/pluggy.ts'

/**
 * Write side of the bank feed. {@link syncFeedAccount} replaces, in one
 * transaction, the stored copy of ONE external account with what the source
 * returned now: upsert of the account and of every transaction by external id,
 * then removal of the transactions the source no longer returns (pending ones
 * that settled under a new id, reversals) — but only from `coveredFrom` on:
 * Open Finance exposes a rolling 12-month window, so older rows are history
 * the source simply stopped serving and are kept forever. The user's mapping
 * onto a fluxi account is never touched. Every statement is scoped by the
 * user and the space the connection is routed to (`bank_feed_items`).
 *
 * Runtime-agnostic (postgres.js + relative imports with extensions): the
 * `pluggy-sync` Edge Function (Deno) imports this exact module, and the Node
 * Postgres suite proves it. It runs as the least-privileged `fluxi_sync` role,
 * which can only touch the feed tables.
 */

const CHUNK = 250

export type SyncCounts = { upserted: number; removed: number }

export type FeedSnapshot = {
  source: string
  account: FeedAccountRow
  transactions: readonly FeedTransactionRow[]
  /** First date (YYYY-MM-DD) the source still serves; older rows are never removed. */
  coveredFrom: string
}

/** Who owns the feed and the space its connection is routed to. */
export type FeedScope = { userId: string; spaceId: string }

export function syncFeedAccount(
  sql: Sql,
  { userId, spaceId }: FeedScope,
  { source, account, transactions, coveredFrom }: FeedSnapshot,
): Promise<SyncCounts> {
  const syncedAt = new Date()
  return sql.begin(async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      insert into bank_feed_accounts
        (user_id, space_id, source, external_id, item_id, institution, name, type, subtype,
         balance_cents, synced_at)
      values
        (${userId}, ${spaceId}, ${source}, ${account.externalId}, ${account.itemId}, ${account.institution},
         ${account.name}, ${account.type}, ${account.subtype}, ${account.balanceCents}, ${syncedAt})
      on conflict (space_id, source, external_id) do update set
        item_id = excluded.item_id,
        institution = excluded.institution,
        name = excluded.name,
        type = excluded.type,
        subtype = excluded.subtype,
        balance_cents = excluded.balance_cents,
        synced_at = excluded.synced_at,
        updated_at = excluded.synced_at
      where bank_feed_accounts.user_id = excluded.user_id
      returning id`
    if (!row) throw new Error('bank feed account upsert returned nothing')
    const feedAccountId = row.id

    for (let i = 0; i < transactions.length; i += CHUNK) {
      const rows = transactions.slice(i, i + CHUNK).map((t) => ({
        user_id: userId,
        space_id: spaceId,
        feed_account_id: feedAccountId,
        external_id: t.externalId,
        date: t.date,
        amount_cents: t.amountCents,
        description: t.description,
        status: t.status,
        category: t.category,
        installment_number: t.installmentNumber,
        total_installments: t.totalInstallments,
        bill_month: t.billMonth,
        synced_at: syncedAt,
      }))
      await tx`
        insert into bank_transactions ${tx(rows)}
        on conflict (user_id, feed_account_id, external_id) do update set
          date = excluded.date,
          amount_cents = excluded.amount_cents,
          description = excluded.description,
          status = excluded.status,
          category = excluded.category,
          installment_number = excluded.installment_number,
          total_installments = excluded.total_installments,
          bill_month = excluded.bill_month,
          synced_at = excluded.synced_at,
          updated_at = excluded.synced_at`
    }

    const keep = transactions.map((t) => t.externalId)
    const removed = await tx`
      delete from bank_transactions
      where user_id = ${userId}
        and space_id = ${spaceId}
        and feed_account_id = ${feedAccountId}
        and date >= ${coveredFrom}
        and external_id <> all(${keep}::text[])
      returning id`
    return { upserted: transactions.length, removed: removed.length }
  })
}
