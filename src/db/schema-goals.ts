import { sql } from 'drizzle-orm'
import { check, foreignKey, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core'
import {
  accounts,
  budgetGroups,
  cents,
  createdAt,
  inSpace,
  isFirstOfMonth,
  month,
  ownerId,
  spaceIdColumn,
  updatedAt,
} from './schema'

/**
 * A goal ("Objetivos"): a monthly slice of a `minimum` budget group (Investimento,
 * Metas). `kind`:
 * - `emergency`: target = `target_cents` or 6 × the average spending of the
 *   `essential` budget group; filled first.
 * - `independence`: `target_cents` = the desired passive income per month
 *   (null = the current standard of living); capital = income × 12 ÷
 *   `withdrawal_bps`; takes whatever its budget group leaves (`monthly_cents` null).
 * - `purchase`: `target_cents` by `target_month`.
 * - `recurring`: `target_cents` every year, next due in `target_month`.
 * The balance is a virtual envelope (`initial_cents` + the slices actually put
 * in the budget group since `start_month`) unless `account_id` names a
 * dedicated account, whose balance wins. Amounts are in today's money.
 */
export const goals = pgTable(
  'goals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: ownerId(),
    spaceId: spaceIdColumn(),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    budgetGroup: text('budget_group').notNull(),
    targetCents: cents('target_cents'),
    targetMonth: month('target_month'),
    monthlyCents: cents('monthly_cents'),
    initialCents: cents('initial_cents').notNull().default(0),
    withdrawalBps: integer('withdrawal_bps').notNull().default(400),
    accountId: uuid('account_id'),
    startMonth: month('start_month').notNull(),
    sort: integer('sort').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    inSpace('goals', t),
    foreignKey({
      name: 'goals_budget_group_fk',
      columns: [t.budgetGroup, t.spaceId],
      foreignColumns: [budgetGroups.key, budgetGroups.spaceId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'goals_account_fk',
      columns: [t.accountId, t.spaceId],
      foreignColumns: [accounts.id, accounts.spaceId],
    }).onDelete('set null'),
    index('goals_space_id_idx').on(t.spaceId),
    check('goals_name_length', sql`char_length(${t.name}) between 1 and 60`),
    check(
      'goals_kind_valid',
      sql`${t.kind} in ('emergency', 'independence', 'purchase', 'recurring')`,
    ),
    check('goals_target_positive', sql`${t.targetCents} is null or ${t.targetCents} > 0`),
    check('goals_monthly_nonnegative', sql`${t.monthlyCents} is null or ${t.monthlyCents} >= 0`),
    check('goals_initial_nonnegative', sql`${t.initialCents} >= 0`),
    check('goals_withdrawal_range', sql`${t.withdrawalBps} between 100 and 1500`),
    check(
      'goals_dated_kinds',
      sql`(${t.kind} in ('purchase', 'recurring')) = (${t.targetMonth} is not null and ${t.targetCents} is not null)`,
    ),
    check(
      'goals_months_first_day',
      sql`${isFirstOfMonth(t.startMonth)} and (${t.targetMonth} is null or ${isFirstOfMonth(t.targetMonth)})`,
    ),
  ],
).enableRLS()
