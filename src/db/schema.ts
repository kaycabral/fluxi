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

export const potKey = pgEnum('pot_key', [
  'essential',
  'comfort',
  'guilt_free',
  'education',
  'variable',
  'investment',
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

/** Budget target per pot, in basis points of income. Seeded per user. */
export const budgetPots = pgTable(
  'budget_pots',
  {
    userId: ownerId(),
    key: potKey('key').notNull(),
    targetBps: integer('target_bps').notNull(),
    sort: integer('sort').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: 'budget_pots_pk', columns: [t.userId, t.key] }),
    check('budget_pots_target_bps_range', sql`${t.targetBps} between 0 and 10000`),
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
    defaultPot: potKey('default_pot'),
    sort: integer('sort').notNull().default(0),
    archivedAt: archivedAt(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('categories_id_user_id_unique').on(t.id, t.userId),
    unique('categories_user_group_name_unique').on(t.userId, t.groupName, t.name),
  ],
).enableRLS()

/**
 * A "lançamento": one income, expense or transfer, possibly recurring from
 * `start_month` (monthly/yearly until `end_month`, or a fixed count of
 * installments). Per-month exceptions live in `entry_overrides`; split payments
 * in `entry_parts`.
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
    pot: potKey('pot'),
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
    index('entries_user_id_start_month_idx').on(t.userId, t.startMonth),
    index('entries_account_id_idx').on(t.accountId),
    index('entries_to_account_id_idx').on(t.toAccountId),
    index('entries_category_id_idx').on(t.categoryId),
    check('entries_amount_positive', sql`${t.amountCents} > 0`),
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
    skipped: boolean('skipped').notNull().default(false),
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
    check('entry_overrides_amount_positive', sql`${t.amountCents} is null or ${t.amountCents} > 0`),
    check('entry_overrides_day_range', sql`${t.day} is null or ${isDayOfMonth(t.day)}`),
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
