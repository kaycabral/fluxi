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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import {
  accounts,
  categories,
  cents,
  createdAt,
  entries,
  inSpace,
  isFirstOfMonth,
  month,
  ownerId,
  pots,
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
 * item is "unassigned" and nothing of it is stored. Assigning it to another
 * space moves what was already synced along (`assignFeedItem`).
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
    /** Last 4 digits of the account / card number ("••4821"); never the full number. */
    numberHint: text('number_hint'),
    accountId: uuid('account_id'),
    /**
     * Who decided `account_id`: `auto` = the auto-link
     * (`private.auto_link_bank_feed`), `manual` = the user (including "Não
     * vincular"), null = nobody yet. The auto-link only touches null.
     */
    mappingSource: text('mapping_source'),
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
    check(
      'bank_feed_accounts_number_hint',
      sql`${t.numberHint} is null or ${t.numberHint} ~ '^[0-9]{4}$'`,
    ),
    check(
      'bank_feed_accounts_mapping_source',
      sql`${t.mappingSource} is null or ${t.mappingSource} in ('auto', 'manual')`,
    ),
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
    /** Open Finance operation type (`PAGAMENTO_FATURA` = card bill payment); a transfer signal. */
    operationType: text('operation_type'),
    installmentNumber: smallint('installment_number'),
    totalInstallments: smallint('total_installments'),
    billMonth: month('bill_month'),
    /**
     * Merchant Pluggy identified (its trade name, else the legal name) and its
     * category; names the entry when the bank's own description is generic.
     */
    merchantName: text('merchant_name'),
    merchantCategory: text('merchant_category'),
    syncedAt: timestamp('synced_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('bank_transactions_external_unique').on(t.userId, t.feedAccountId, t.externalId),
    unique('bank_transactions_id_space_id_unique').on(t.id, t.spaceId),
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

/**
 * Bank transaction ↔ ledger entry: each transaction of a MAPPED feed account
 * is materialized as a one-off entry (`private.materialize_bank_feed`, run by
 * the sync), one link per transaction; a detected transfer pair is ONE entry
 * linked from both transactions. The bank owns the entry (amount, date,
 * account, kind, "Pago"; the user can neither change nor delete it), the user
 * its description, category, pot and tags.
 *
 * Both foreign keys null only their own column on delete, so the link
 * outlives either side: the bank dropping the transaction leaves
 * `bank_transaction_id` null and the next materialization deletes the entry
 * and the link; `entry_id` is null only inside an undo (which deletes and
 * restores the entry, then re-points the link) and a link left that way is
 * dropped and re-materialized.
 */
export const bankEntryLinks = pgTable(
  'bank_entry_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: ownerId(),
    spaceId: spaceIdColumn(),
    bankTransactionId: uuid('bank_transaction_id'),
    entryId: uuid('entry_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    inSpace('bank_entry_links', t),
    foreignKey({
      name: 'bank_entry_links_transaction_fk',
      columns: [t.bankTransactionId, t.spaceId],
      foreignColumns: [bankTransactions.id, bankTransactions.spaceId],
    }).onDelete('set null'),
    foreignKey({
      name: 'bank_entry_links_entry_fk',
      columns: [t.entryId, t.spaceId],
      foreignColumns: [entries.id, entries.spaceId],
    }).onDelete('set null'),
    uniqueIndex('bank_entry_links_transaction_idx').on(t.bankTransactionId),
    index('bank_entry_links_entry_id_idx').on(t.entryId),
    index('bank_entry_links_space_id_idx').on(t.spaceId),
  ],
).enableRLS()

/**
 * "Fazer isso sozinho daqui para frente": a bank entry whose normalized
 * description is `pattern` (`descriptionKey`) and whose absolute amount lies
 * in `[min_cents, max_cents]` gets this category / pot. Applied by the
 * materialization (`private.apply_categorization_rules`) only to bank entries
 * still without category AND pot: it never overwrites the user. Newest wins.
 */
export const categorizationRules = pgTable(
  'categorization_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: ownerId(),
    spaceId: spaceIdColumn(),
    pattern: text('pattern').notNull(),
    minCents: cents('min_cents').notNull(),
    maxCents: cents('max_cents').notNull(),
    categoryId: uuid('category_id'),
    pot: text('pot'),
    createdAt: createdAt(),
  },
  (t) => [
    inSpace('categorization_rules', t),
    foreignKey({
      name: 'categorization_rules_category_fk',
      columns: [t.categoryId, t.spaceId],
      foreignColumns: [categories.id, categories.spaceId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'categorization_rules_pot_fk',
      columns: [t.pot, t.spaceId],
      foreignColumns: [pots.key, pots.spaceId],
    }).onDelete('cascade'),
    index('categorization_rules_space_pattern_idx').on(t.spaceId, t.pattern),
    check('categorization_rules_pattern', sql`char_length(${t.pattern}) between 1 and 200`),
    check('categorization_rules_range', sql`${t.minCents} >= 0 and ${t.maxCents} >= ${t.minCents}`),
    check('categorization_rules_target', sql`${t.categoryId} is not null or ${t.pot} is not null`),
  ],
).enableRLS()
