import { sql } from 'drizzle-orm'
import pg from 'pg'
import { fluxiDb, type FluxiDb } from './db'

/**
 * Dedicated database for the Postgres integration suite, in the SAME local
 * Postgres as the dev stack (`postgres` database). The suite truncates every
 * table and deletes every auth user between tests, so it must never run
 * against the dev database, which holds real (imported) data.
 *
 * Supabase's `auth` schema lives only in the `postgres` database (GoTrue
 * migrates it there), so the test database gets a minimal `auth.users` stub:
 * just the columns the migrations (FK + trigger) and `seedUser` touch. Roles
 * (`anon`, `authenticated`, `service_role`) are cluster-wide and already exist;
 * the API-role grants Supabase sets up on `public` are mirrored, so the RLS
 * tests prove the same thing they would on the real database.
 */
export const TEST_DATABASE = 'fluxi_test'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', 'postgres'])

/** `baseUrl` (any database of the local stack) pointed at {@link TEST_DATABASE}. */
export function testDatabaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl)
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`refusing to use a non-local Postgres for tests (host: ${url.hostname})`)
  }
  url.pathname = `/${TEST_DATABASE}`
  return url.toString()
}

/** Throws unless `url` is the local test database. */
export function assertTestDatabaseUrl(raw: string | undefined): void {
  const url = raw === undefined || raw === '' ? null : new URL(raw)
  if (url === null || !LOCAL_HOSTS.has(url.hostname) || url.pathname !== `/${TEST_DATABASE}`) {
    const target = url === null ? '(unset)' : `${url.hostname}${url.pathname}`
    throw new Error(
      `refusing to run a destructive test helper outside ${TEST_DATABASE} (${target})`,
    )
  }
}

/**
 * Throws unless `db` is connected to the local test database. Checks both the
 * configured URL and what the server reports, so a pooler or a misconfigured
 * env cannot redirect a wipe to the dev database.
 */
export async function assertTestDatabase(db: FluxiDb): Promise<void> {
  assertTestDatabaseUrl(process.env.POSTGRES_URL)
  const result = await db.execute<{ name: string }>(sql`select current_database() as name`)
  const name = result.rows[0]?.name
  if (name !== TEST_DATABASE) {
    throw new Error(`refusing to run a destructive test helper on database ${name ?? '(unknown)'}`)
  }
}

const AUTH_STUB = `
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  instance_id uuid,
  aud varchar(255),
  role varchar(255),
  email varchar(255),
  raw_user_meta_data jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  confirmation_token varchar(255),
  recovery_token varchar(255),
  email_change_token_new varchar(255),
  email_change varchar(255),
  email_change_token_current varchar(255) default '',
  phone_change text default '',
  phone_change_token varchar(255) default '',
  reauthentication_token varchar(255) default ''
);
grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on functions to anon, authenticated, service_role;
`

// Tables created before the default privileges existed (older test databases).
// The suite also impersonates `fluxi_sync` (migration 0014) with `set role`,
// which needs the SET option on the membership (PG16+ only grants ADMIN to
// the creator).
const API_GRANTS = `
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant fluxi_sync to current_user with inherit false, set true;
`

async function withClient<T>(url: string, run: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url })
  await client.connect()
  try {
    return await run(client)
  } finally {
    await client.end()
  }
}

const DUPLICATE_DATABASE = '42P04'

/**
 * Create (if missing) and migrate {@link TEST_DATABASE} next to `baseUrl`'s
 * database. Idempotent; returns the test database URL.
 */
export async function prepareTestDatabase(baseUrl: string): Promise<string> {
  const testUrl = testDatabaseUrl(baseUrl)
  const adminUrl = new URL(testUrl)
  adminUrl.pathname = '/postgres'
  await withClient(adminUrl.toString(), async (client) => {
    const existing = await client.query('select 1 from pg_database where datname = $1', [
      TEST_DATABASE,
    ])
    if (existing.rowCount !== 0) return
    try {
      await client.query(`create database ${TEST_DATABASE}`)
    } catch (error) {
      // A concurrent run created it first: fine.
      if (!(error instanceof Error && 'code' in error && error.code === DUPLICATE_DATABASE)) {
        throw error
      }
    }
  })
  await withClient(testUrl, (client) => client.query(AUTH_STUB))
  await fluxiDb.migrate({ connectionString: testUrl })
  await withClient(testUrl, (client) => client.query(API_GRANTS))
  return testUrl
}
