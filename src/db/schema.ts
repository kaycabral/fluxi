import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { authUsers } from 'drizzle-orm/supabase'

/**
 * Postgres (Supabase) schema for fluxi.
 *
 * Every table has RLS enabled with NO policies: the only reader/writer is the
 * server (the `postgres` role via the Supabase pooler, which bypasses RLS), so
 * the public PostgREST API exposed with the publishable key returns nothing.
 * The browser only talks to Supabase Auth directly — see the `0001_auth`
 * migration for the auth trigger.
 */

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()

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
