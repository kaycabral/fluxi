import { sql, type SQL } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'
import { authUsers } from 'drizzle-orm/supabase'

/**
 * Postgres (Supabase) schema for fluxi.
 *
 * Every table has RLS enabled with NO policies: the only reader/writer is the
 * server (the `postgres` role via the Supabase pooler, which bypasses RLS), so
 * the public PostgREST API exposed with the publishable key returns nothing.
 * The browser only talks to Supabase Auth directly — see the `0001_auth`
 * migration for the auth trigger.
 *
 * Ledger conventions: money is integer cents (`bigint`, mode number), shares
 * are basis points (10000 = 100%), months are a `date` pinned to the 1st.
 * Every ledger row carries `user_id` (cascade from `profiles`), and rows that
 * point at another ledger row do it through a composite `(id, user_id)` foreign
 * key, so the database itself refuses a reference across users.
 */

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
const archivedAt = () => timestamp('archived_at', { withTimezone: true })
const cents = (name: string) => bigint(name, { mode: 'number' })
const month = (name: string) => date(name, { mode: 'string' })
const ownerId = () =>
  uuid('user_id')
    .notNull()
    .references(() => profiles.id, { onDelete: 'cascade' })

const isFirstOfMonth = (column: AnyPgColumn): SQL => sql`extract(day from ${column}) = 1`
const isDayOfMonth = (column: AnyPgColumn): SQL => sql`${column} between 1 and 31`

/**
 * One row per Supabase Auth user, created by the `on_auth_user_created` trigger
 * from the Google identity (name + avatar).
 */
export const profiles = pgTable('profiles', {
  id: uuid('id')
    .primaryKey()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS()

export const accountType = pgEnum('account_type', [
  'checking',
  'credit',
  'benefit',
  'investment',
  'loan',
])

export const entryKind = pgEnum('entry_kind', ['income', 'expense', 'transfer'])

export const recurrence = pgEnum('recurrence', ['none', 'monthly', 'yearly', 'installments'])

/** Day rule of a monthly series: the day number, its nth weekday or its last weekday. */
export const monthBy = pgEnum('month_by', ['day', 'weekday', 'last_weekday'])

/** A financial institution grouping accounts (e.g. "Nubank"). */
export const banks = pgTable(
  'banks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: ownerId(),
    name: text('name').notNull(),
    sort: integer('sort').notNull().default(0),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('banks_id_user_id_unique').on(t.id, t.userId),
    index('banks_user_id_sort_idx').on(t.userId, t.sort),
  ],
).enableRLS()

/** A balance holder: checking account, credit card, benefit card, investment or loan. */
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: ownerId(),
    bankId: uuid('bank_id').notNull(),
    name: text('name').notNull(),
    type: accountType('type').notNull(),
    openingBalanceCents: cents('opening_balance_cents').notNull().default(0),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('accounts_id_user_id_unique').on(t.id, t.userId),
    foreignKey({
      name: 'accounts_bank_fk',
      columns: [t.bankId, t.userId],
      foreignColumns: [banks.id, banks.userId],
    }),
    index('accounts_user_id_idx').on(t.userId),
    index('accounts_bank_id_idx').on(t.bankId),
  ],
).enableRLS()

/**
 * Spending/saving pot of the budget, created and renamed by the user. `key` is
 * the stable id entries and categories point at (the 6 seeded pots keep their
 * historic keys). `goal`: `limit` = spend up to the target, `minimum` = put
 * aside at least the target (investment). Archived pots leave the pickers but
 * keep their history.
 */
export const pots = pgTable(
  'pots',
  {
    userId: ownerId(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    color: text('color').notNull(),
    goal: text('goal').notNull().default('limit'),
    sort: integer('sort').notNull().default(0),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'pots_pk', columns: [t.userId, t.key] }),
    check('pots_key_format', sql`${t.key} ~ '^[a-z0-9_]{1,40}$'`),
    check('pots_name_length', sql`char_length(${t.name}) between 1 and 40`),
    check('pots_goal_valid', sql`${t.goal} in ('limit', 'minimum')`),
  ],
).enableRLS()

/**
 * A version of the budget: the pot targets in force from `starts_month` until
 * the next plan starts. Months before the first plan have no target.
 */
export const budgetPlans = pgTable(
  'budget_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: ownerId(),
    startsMonth: month('starts_month').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('budget_plans_id_user_id_unique').on(t.id, t.userId),
    unique('budget_plans_user_starts_unique').on(t.userId, t.startsMonth),
    check('budget_plans_starts_first_day', isFirstOfMonth(t.startsMonth)),
  ],
).enableRLS()

/** Target of one pot in one plan, in basis points of the month's income (a plan sums to at most 100%). */
export const budgetPlanTargets = pgTable(
  'budget_plan_targets',
  {
    planId: uuid('plan_id').notNull(),
    userId: ownerId(),
    potKey: text('pot_key').notNull(),
    targetBps: integer('target_bps').notNull(),
  },
  (t) => [
    primaryKey({ name: 'budget_plan_targets_pk', columns: [t.planId, t.potKey] }),
    foreignKey({
      name: 'budget_plan_targets_plan_fk',
      columns: [t.planId, t.userId],
      foreignColumns: [budgetPlans.id, budgetPlans.userId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'budget_plan_targets_pot_fk',
      columns: [t.potKey, t.userId],
      foreignColumns: [pots.key, pots.userId],
    }).onDelete('cascade'),
    check('budget_plan_targets_bps_range', sql`${t.targetBps} between 0 and 10000`),
  ],
).enableRLS()

/** Two-level category (group › name) with the pot it suggests for expenses. Seeded per user. */
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: ownerId(),
    groupName: text('group_name').notNull(),
    name: text('name').notNull(),
    defaultPot: text('default_pot'),
    sort: integer('sort').notNull().default(0),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('categories_id_user_id_unique').on(t.id, t.userId),
    unique('categories_user_group_name_unique').on(t.userId, t.groupName, t.name),
    foreignKey({
      name: 'categories_default_pot_fk',
      columns: [t.defaultPot, t.userId],
      foreignColumns: [pots.key, pots.userId],
    }),
  ],
).enableRLS()

/**
 * A "lançamento": one income, expense or transfer, possibly recurring from
 * `start_month` (monthly/yearly until `end_month`, or a fixed count of
 * installments). Per-month exceptions live in `entry_overrides`; split payments
 * in `entry_parts`. `amount_cents` is signed from `account_id`'s point of view
 * (negative = money leaves it; a transfer is always negative and its
 * destination gets the opposite).
 */
export const entries = pgTable(
  'entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: ownerId(),
    kind: entryKind('kind').notNull(),
    description: text('description').notNull(),
    amountCents: cents('amount_cents').notNull(),
    accountId: uuid('account_id').notNull(),
    toAccountId: uuid('to_account_id'),
    categoryId: uuid('category_id'),
    pot: text('pot'),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    startMonth: month('start_month').notNull(),
    day: smallint('day').notNull(),
    recurrence: recurrence('recurrence').notNull(),
    /** Every N months/years (monthly/yearly); 1 for the other recurrences. */
    repeatEvery: smallint('repeat_every').notNull().default(1),
    monthBy: monthBy('month_by').notNull().default('day'),
    installments: integer('installments'),
    endMonth: month('end_month'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('entries_id_user_id_unique').on(t.id, t.userId),
    foreignKey({
      name: 'entries_account_fk',
      columns: [t.accountId, t.userId],
      foreignColumns: [accounts.id, accounts.userId],
    }),
    foreignKey({
      name: 'entries_to_account_fk',
      columns: [t.toAccountId, t.userId],
      foreignColumns: [accounts.id, accounts.userId],
    }),
    foreignKey({
      name: 'entries_category_fk',
      columns: [t.categoryId, t.userId],
      foreignColumns: [categories.id, categories.userId],
    }),
    foreignKey({
      name: 'entries_pot_fk',
      columns: [t.pot, t.userId],
      foreignColumns: [pots.key, pots.userId],
    }),
    index('entries_pot_idx').on(t.userId, t.pot),
    index('entries_user_id_start_month_idx').on(t.userId, t.startMonth),
    index('entries_account_id_idx').on(t.accountId),
    index('entries_to_account_id_idx').on(t.toAccountId),
    index('entries_category_id_idx').on(t.categoryId),
    check('entries_amount_nonzero', sql`${t.amountCents} <> 0`),
    check('entries_transfer_negative', sql`${t.kind} <> 'transfer' or ${t.amountCents} < 0`),
    check('entries_day_range', isDayOfMonth(t.day)),
    check('entries_start_month_first_day', isFirstOfMonth(t.startMonth)),
    check(
      'entries_end_month_valid',
      sql`${t.endMonth} is null or (${isFirstOfMonth(t.endMonth)} and ${t.endMonth} >= ${t.startMonth} and ${t.recurrence} in ('monthly', 'yearly'))`,
    ),
    check(
      'entries_repeat_every_valid',
      sql`${t.repeatEvery} between 1 and 99 and (${t.repeatEvery} = 1 or ${t.recurrence} in ('monthly', 'yearly'))`,
    ),
    check(
      'entries_month_by_monthly_only',
      sql`${t.monthBy} = 'day' or ${t.recurrence} = 'monthly'`,
    ),
    check(
      'entries_installments_valid',
      sql`(${t.recurrence} = 'installments') = (${t.installments} is not null) and (${t.installments} is null or ${t.installments} >= 1)`,
    ),
    check(
      'entries_transfer_fields',
      sql`case when ${t.kind} = 'transfer'
        then ${t.toAccountId} is not null and ${t.toAccountId} <> ${t.accountId} and ${t.categoryId} is null and ${t.pot} is null
        else ${t.toAccountId} is null end`,
    ),
    check('entries_pot_expense_only', sql`${t.pot} is null or ${t.kind} = 'expense'`),
  ],
).enableRLS()

/**
 * Split payment of an entry's occurrence (e.g. advance 40% on day 20 + rest
 * 60% on day 5 of the next month). Shares are basis points; the projection
 * gives the rounding remainder to the last part so parts sum to the amount.
 */
export const entryParts = pgTable(
  'entry_parts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entryId: uuid('entry_id').notNull(),
    userId: ownerId(),
    label: text('label').notNull(),
    bps: integer('bps').notNull(),
    day: smallint('day').notNull(),
    nextMonth: boolean('next_month').notNull().default(false),
    sort: integer('sort').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({
      name: 'entry_parts_entry_fk',
      columns: [t.entryId, t.userId],
      foreignColumns: [entries.id, entries.userId],
    }).onDelete('cascade'),
    // Target of `occurrence_payments_part_fk`: a payment's part belongs to its entry.
    unique('entry_parts_id_entry_id_unique').on(t.id, t.entryId),
    index('entry_parts_entry_id_sort_idx').on(t.entryId, t.sort),
    index('entry_parts_user_id_idx').on(t.userId),
    check('entry_parts_bps_range', sql`${t.bps} between 1 and 10000`),
    check('entry_parts_day_range', isDayOfMonth(t.day)),
  ],
).enableRLS()

/**
 * Per-month exception of a recurring entry, keyed by the occurrence's month
 * (its competence month). `skipped` hides that occurrence entirely.
 */
export const entryOverrides = pgTable(
  'entry_overrides',
  {
    entryId: uuid('entry_id').notNull(),
    userId: ownerId(),
    month: month('month').notNull(),
    amountCents: cents('amount_cents'),
    day: smallint('day'),
    /** No occurrence this month (never counts). */
    skipped: boolean('skipped').notNull().default(false),
    /**
     * The user deleted this one occurrence ("Só este mês"): skipped and never
     * shown, not even with "Mostrar ignorados" (that shows months skipped by
     * the import).
     */
    deleted: boolean('deleted').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'entry_overrides_pk', columns: [t.entryId, t.month] }),
    foreignKey({
      name: 'entry_overrides_entry_fk',
      columns: [t.entryId, t.userId],
      foreignColumns: [entries.id, entries.userId],
    }).onDelete('cascade'),
    index('entry_overrides_user_id_month_idx').on(t.userId, t.month),
    check('entry_overrides_month_first_day', isFirstOfMonth(t.month)),
    check('entry_overrides_amount_nonzero', sql`${t.amountCents} is null or ${t.amountCents} <> 0`),
    check('entry_overrides_day_range', sql`${t.day} is null or ${isDayOfMonth(t.day)}`),
    check('entry_overrides_deleted_is_skipped', sql`not ${t.deleted} or ${t.skipped}`),
  ],
).enableRLS()

/**
 * "Pago/recebido": one row per paid occurrence of an entry, keyed by the
 * occurrence's competence month (like `entry_overrides`) and, for a split
 * entry, by the part (each part is paid separately; `part_id` null = the whole
 * occurrence). Purely a status: it never changes the projected balance, which
 * already counts the occurrence. Scoped edits/deletes keep it consistent
 * (`adapters/ledger.write.ts`).
 */
export const occurrencePayments = pgTable(
  'occurrence_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: ownerId(),
    entryId: uuid('entry_id').notNull(),
    month: month('month').notNull(),
    partId: uuid('part_id'),
    paidOn: date('paid_on', { mode: 'string' }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      name: 'occurrence_payments_entry_fk',
      columns: [t.entryId, t.userId],
      foreignColumns: [entries.id, entries.userId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'occurrence_payments_part_fk',
      columns: [t.partId, t.entryId],
      foreignColumns: [entryParts.id, entryParts.entryId],
    }).onDelete('cascade'),
    // One payment per occurrence (or per part of it); NULLS NOT DISTINCT so a
    // whole-occurrence payment (`part_id` null) is unique too.
    unique('occurrence_payments_occurrence_unique')
      .on(t.entryId, t.month, t.partId)
      .nullsNotDistinct(),
    index('occurrence_payments_user_id_month_idx').on(t.userId, t.month),
    index('occurrence_payments_part_id_idx').on(t.partId),
    check('occurrence_payments_month_first_day', isFirstOfMonth(t.month)),
  ],
).enableRLS()

/** Per-user preferences; `count_from_month` is where balances start accumulating. Seeded per user. */
export const userSettings = pgTable(
  'user_settings',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    countFromMonth: month('count_from_month'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check(
      'user_settings_count_from_first_day',
      sql`${t.countFromMonth} is null or ${isFirstOfMonth(t.countFromMonth)}`,
    ),
  ],
).enableRLS()

/**
 * The last undoable ledger action of each user ("Desfazer", like Google
 * Calendar): the rows of the entries it touched as they were before it, one
 * `to_jsonb` per row, restored as they were. One row per user, replaced by
 * each new action and honored for a few minutes only; expired rows are swept
 * on every new action and the client drops its own when the toast closes, so
 * a deleted entry does not live on here.
 */
export const undoSnapshots = pgTable('undo_snapshots', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  /** Changes on every action: an undo only applies to the action it was offered for. */
  token: uuid('token').notNull(),
  /** Every entry the action touched, including the ones it created. */
  entryIds: uuid('entry_ids').array().notNull(),
  entries: jsonb('entries').notNull(),
  entryParts: jsonb('entry_parts').notNull(),
  entryOverrides: jsonb('entry_overrides').notNull(),
  occurrencePayments: jsonb('occurrence_payments').notNull(),
  createdAt: createdAt(),
}).enableRLS()

/**
 * Internal: maps an external record (e.g. a Notion page) to the entry it
 * produced, so importers can re-run idempotently.
 */
export const importLinks = pgTable(
  'import_links',
  {
    userId: ownerId(),
    source: text('source').notNull(),
    externalId: text('external_id').notNull(),
    entryId: uuid('entry_id').notNull(),
    month: month('month'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'import_links_pk', columns: [t.userId, t.source, t.externalId] }),
    foreignKey({
      name: 'import_links_entry_fk',
      columns: [t.entryId, t.userId],
      foreignColumns: [entries.id, entries.userId],
    }).onDelete('cascade'),
    index('import_links_entry_id_idx').on(t.entryId),
    check('import_links_month_first_day', sql`${t.month} is null or ${isFirstOfMonth(t.month)}`),
  ],
).enableRLS()

/**
 * Internal: lossless archive of every external record an importer read (e.g.
 * each Notion page of the finance workspace, imported or not), so nothing from
 * the source is lost even when it does not map onto the ledger. `target_id`
 * names the fluxi row the import created from it (bank, account, or a
 * `category` row the importer synthesized), so a re-run can delete exactly what
 * it created; null for records with no single target.
 */
export const importRaw = pgTable(
  'import_raw',
  {
    userId: ownerId(),
    source: text('source').notNull(),
    kind: text('kind').notNull(),
    externalId: text('external_id').notNull(),
    payload: jsonb('payload').notNull(),
    targetId: uuid('target_id'),
    importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'import_raw_pk', columns: [t.userId, t.source, t.kind, t.externalId] }),
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
    unique('bank_feed_accounts_id_user_id_unique').on(t.id, t.userId),
    unique('bank_feed_accounts_external_unique').on(t.userId, t.source, t.externalId),
    foreignKey({
      name: 'bank_feed_accounts_account_fk',
      columns: [t.accountId, t.userId],
      foreignColumns: [accounts.id, accounts.userId],
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
      columns: [t.feedAccountId, t.userId],
      foreignColumns: [bankFeedAccounts.id, bankFeedAccounts.userId],
    }).onDelete('cascade'),
    index('bank_transactions_feed_account_date_idx').on(t.feedAccountId, t.date),
    check('bank_transactions_status', sql`${t.status} in ('POSTED', 'PENDING')`),
    check(
      'bank_transactions_bill_month_first_day',
      sql`${t.billMonth} is null or ${isFirstOfMonth(t.billMonth)}`,
    ),
  ],
).enableRLS()
