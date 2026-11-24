import { sql } from 'drizzle-orm'
import type { FluxiDb } from './db'
import { assertTestDatabase } from './test-database'

export type SeedUserInput = {
  id: string
  email: string
  displayName?: string
  avatarUrl?: string | null
}

/**
 * Insert a LOCAL auth user (the `on_auth_user_created` trigger creates its
 * profile). Fixture builder for the integration suite and local dev only —
 * never point it at Supabase production; real users come from Google sign-in.
 */
export async function seedUser(db: FluxiDb, input: SeedUserInput): Promise<void> {
  const metadata = JSON.stringify({
    full_name: input.displayName ?? null,
    avatar_url: input.avatarUrl ?? null,
  })
  // GoTrue scans the token columns as non-null strings: leaving them NULL breaks
  // its admin API ("Database error finding users"), so seed them as ''.
  await db.execute(sql`
    insert into auth.users (
      id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    )
    values (
      ${input.id}, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      ${input.email}, ${metadata}::jsonb, now(), now(), '', '', '', '', '', '', '', ''
    )`)
}

/**
 * Empty app tables and auth users of the TEST database (integration suite
 * only). Refuses any other database — see `assertTestDatabase`.
 */
export async function truncateFluxiTables(db: FluxiDb): Promise<void> {
  await assertTestDatabase(db)
  await db.execute(sql`truncate table profiles restart identity cascade`)
  await db.execute(sql`delete from auth.users`)
}
