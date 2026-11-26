import { sql } from 'drizzle-orm'
import {
  check,
  date,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'
import {
  accounts,
  cents,
  createdAt,
  inSpace,
  isFirstOfMonth,
  month,
  ownerId,
  spaceIdColumn,
  spaces,
  updatedAt,
} from './schema'

/**
 * Bank feed tables (Open Finance via Pluggy), kept apart from the ledger
 * schema. Written by the `pluggy-sync` Edge Function as the `fluxi_sync` role
 * (see `src/features/bank-feed`). Same conventions as `./schema`.
 */

/**
 * A bank connection (Pluggy item) of the user and the space its data goes to.
 * The sync records every configured item here; while `space_id` is null the
 * item is "unassigned" and nothing of it is stored. Assigning an item only
 * routes future syncs: no data moves between spaces.
 */
export const bankFeedItems = pgTable(
  'bank_feed_items',
  {
    userId: ownerId(),
    itemId: text('item_id').notNull(),
    spaceId: uuid('space_id'),
    label: text('label'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'bank_feed_items_pk', columns: [t.userId, t.itemId] }),
    foreignKey({
      name: 'bank_feed_items_space_fk',
      columns: [t.spaceId, t.userId],
      foreignColumns: [spaces.id, spaces.userId],
    }),
  ],
).enableRLS()

/**
 * Bank feed (Open Finance via Pluggy / Meu Pluggy): an external account as the
 * institution reports it, refreshed by `pnpm pluggy:sync`. `account_id` maps it
 * onto a fluxi account (null until the user maps it); deleting the fluxi
 * account only unmaps the feed. `balance_cents` is the last reported balance
 * (credit cards: the open bill, positive = owed).
 */
export const bankFeedAccounts = pgTable(
  'bank_feed_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: ownerId(),
    spaceId: spaceIdColumn(),
    source: text('source').notNull(),
    externalId: text('external_id').notNull(),
    itemId: text('item_id').notNull(),
    institution: text('institution').notNull(),
    name: text('name').notNull(),
    type: text('type').notNull(),
    subtype: text('subtype').notNull(),
    balanceCents: cents('balance_cents').notNull(),
    accountId: uuid('account_id'),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    inSpace('bank_feed_accounts', t),
    unique('bank_feed_accounts_id_space_id_unique').on(t.id, t.spaceId),
    unique('bank_feed_accounts_external_unique').on(t.spaceId, t.source, t.externalId),
    foreignKey({
      name: 'bank_feed_accounts_account_fk',
      columns: [t.accountId, t.spaceId],
      foreignColumns: [accounts.id, accounts.spaceId],
    }).onDelete('set null'),
    index('bank_feed_accounts_account_id_idx').on(t.accountId),
  ],
).enableRLS()

/**
 * One real transaction of a feed account. `amount_cents` is signed from the
 * holder's view (DEBIT < 0, CREDIT > 0, also on credit cards). Counterparty
 * documents (`paymentData`) are deliberately NOT stored.
 */
export const bankTransactions = pgTable(
  'bank_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: ownerId(),
    spaceId: spaceIdColumn(),
    feedAccountId: uuid('feed_account_id').notNull(),
    externalId: text('external_id').notNull(),
    date: date('date', { mode: 'string' }).notNull(),
    amountCents: cents('amount_cents').notNull(),
    description: text('description').notNull(),
    status: text('status').notNull(),
    category: text('category'),
    installmentNumber: smallint('installment_number'),
    totalInstallments: smallint('total_installments'),
    billMonth: month('bill_month'),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('bank_transactions_external_unique').on(t.userId, t.feedAccountId, t.externalId),
    foreignKey({
      name: 'bank_transactions_feed_account_fk',
      columns: [t.feedAccountId, t.spaceId],
      foreignColumns: [bankFeedAccounts.id, bankFeedAccounts.spaceId],
    }).onDelete('cascade'),
    inSpace('bank_transactions', t),
    index('bank_transactions_feed_account_date_idx').on(t.feedAccountId, t.date),
    check('bank_transactions_status', sql`${t.status} in ('POSTED', 'PENDING')`),
    check(
      'bank_transactions_bill_month_first_day',
      sql`${t.billMonth} is null or ${isFirstOfMonth(t.billMonth)}`,
    ),
  ],
).enableRLS()
