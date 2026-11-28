import { fluxiDb, personalScope, seedUser, truncateFluxiTables } from '@/db'
import { APP_ROLE } from '@/db/local-app-role'
import { ownerDb } from '@/db/owner'
import { listAccounts } from '@/features/ledger/adapters/ledger.repo'
import { createAccount, createBank, renameAccount } from '@/features/ledger/adapters/ledger.write'
import type { Scope } from '@/features/spaces/core/space'
import { pgErrorOf } from '@cbrl/pg'
import { sql, type SQL } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'

// The app's runtime role (migration 0034, #65). `fluxiDb` here connects as it,
// exactly like the app in production; `ownerDb` is the owner, for fixtures.

const ANA = '11111111-1111-4111-8111-111111111111'
const BIA = '22222222-2222-4222-8222-222222222222'

const db = () => fluxiDb.db()
const owner = () => ownerDb.db()

/** The tables the app reads and writes; every other relation is off limits. */
const APP_TABLES = [
  'accounts',
  'bank_entry_links',
  'bank_feed_accounts',
  'bank_feed_items',
  'bank_transactions',
  'banks',
  'budget_group_targets',
  'budget_groups',
  'budget_versions',
  'categories',
  'categorization_rules',
  'entries',
  'entry_overrides',
  'entry_parts',
  'goals',
  'occurrence_payments',
  'profiles',
  'spaces',
  'undo_snapshots',
  'user_settings',
]

/** The SECURITY DEFINER functions the app calls (and nothing else it may run as their owner). */
const APP_DEFINER_FUNCTIONS = [
  'ensure_personal_space(uuid)',
  'private.materialize_bank_feed(uuid,uuid,date)',
  'seed_space_defaults(uuid)',
]

async function sqlState(query: SQL): Promise<string | undefined> {
  try {
    await db().execute(query)
  } catch (error) {
    return pgErrorOf(error)?.code
  }
  return undefined
}

let ana: Scope
let bia: Scope

beforeEach(async () => {
  await truncateFluxiTables(owner())
  await seedUser(owner(), { id: ANA, email: 'ana@example.test' })
  await seedUser(owner(), { id: BIA, email: 'bia@example.test' })
  ana = await personalScope(db(), ANA)
  bia = await personalScope(db(), BIA)
})

describe('runtime role', () => {
  it('is what the app connects as: no owner, no superuser, no RLS bypass', async () => {
    const { rows } = await db().execute<{
      who: string
      superuser: boolean
      bypass: boolean
      owns: number
    }>(sql`
      select current_user as who, r.rolsuper as superuser, r.rolbypassrls as bypass,
        (select count(*)::int from pg_class c where c.relowner = r.oid)
          + (select count(*)::int from pg_proc p where p.proowner = r.oid)
          + (select count(*)::int from pg_namespace n where n.nspowner = r.oid) as owns
      from pg_roles r where r.rolname = current_user`)
    expect(rows).toEqual([{ who: APP_ROLE, superuser: false, bypass: false, owns: 0 }])
  })

  it('reaches only the app tables, and only with DML', async () => {
    const { rows } = await owner().execute<{ rel: string; privileges: string }>(sql`
      select n.nspname || '.' || c.relname as rel,
        concat_ws(',',
          case when has_table_privilege(${APP_ROLE}, c.oid, 'SELECT') then 'SELECT' end,
          case when has_table_privilege(${APP_ROLE}, c.oid, 'INSERT') then 'INSERT' end,
          case when has_table_privilege(${APP_ROLE}, c.oid, 'UPDATE') then 'UPDATE' end,
          case when has_table_privilege(${APP_ROLE}, c.oid, 'DELETE') then 'DELETE' end,
          case when has_table_privilege(${APP_ROLE}, c.oid, 'TRUNCATE') then 'TRUNCATE' end,
          case when has_table_privilege(${APP_ROLE}, c.oid, 'REFERENCES') then 'REFERENCES' end,
          case when has_table_privilege(${APP_ROLE}, c.oid, 'TRIGGER') then 'TRIGGER' end
        ) as privileges
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p', 'v', 'm', 'f', 'S')
        and n.nspname not in ('pg_catalog', 'information_schema')
        and has_table_privilege(${APP_ROLE}, c.oid,
          'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      order by 1`)
    expect(rows).toEqual(
      APP_TABLES.map((t) => ({ rel: `public.${t}`, privileges: 'SELECT,INSERT,UPDATE,DELETE' })),
    )
  })

  it('runs only the definer functions the app calls', async () => {
    const { rows } = await owner().execute<{ fn: string }>(sql`
      select p.oid::regprocedure::text as fn
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where p.prosecdef and n.nspname not in ('pg_catalog', 'information_schema')
        and has_function_privilege(${APP_ROLE}, p.oid, 'EXECUTE')
      order by 1`)
    expect(rows.map((r) => r.fn)).toEqual(APP_DEFINER_FUNCTIONS)
  })

  it('keeps every app table under forced RLS with a policy for the role', async () => {
    const { rows } = await owner().execute<{ rel: string; rls: boolean; forced: boolean }>(sql`
      select c.relname as rel, c.relrowsecurity as rls, c.relforcerowsecurity as forced
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and exists (
          select 1 from pg_policies p
          where p.schemaname = 'public' and p.tablename = c.relname
            and ${APP_ROLE} = any (p.roles)
        )
      order by 1`)
    // A table added without grants + policy for the role fails here (and in the app).
    expect(rows).toEqual(APP_TABLES.map((rel) => ({ rel, rls: true, forced: true })))
  })

  it.each([
    ['auth.users', sql`select 1 from auth.users limit 1`],
    ['DDL', sql`create table public.intruder (id int)`],
    ['TRUNCATE', sql`truncate table public.entries`],
    ['disabling RLS', sql`alter table public.entries disable row level security`],
    ['an internal definer function', sql`select private.auto_link_bank_feed(${ANA}::uuid, null)`],
    ['the owner role', sql`set role postgres`],
  ])('is refused %s', async (_what, query) => {
    expect(await sqlState(query)).toBe('42501')
  })
})

describe('user isolation as the runtime role', () => {
  it('never reads or changes another user’s rows through the adapters', async () => {
    const bankId = randomUUID()
    const accountId = randomUUID()
    await createBank(bia, { id: bankId, name: 'Nubank' })
    await createAccount(bia, {
      id: accountId,
      bankId,
      name: 'Conta da Bia',
      type: 'checking',
      openingBalanceCents: 100,
    })

    await expect(listAccounts(ana)).resolves.toEqual([])
    // Ana's session naming Bia's account (or a space of Bia's) changes nothing.
    await expect(renameAccount(ana, { id: accountId, name: 'x' })).resolves.toEqual({
      ok: false,
      reason: 'not_found',
    })
    await expect(
      renameAccount({ userId: ANA, spaceId: bia.spaceId }, { id: accountId, name: 'x' }),
    ).resolves.toEqual({ ok: false, reason: 'not_found' })
    expect((await listAccounts(bia)).map((a) => a.name)).toEqual(['Conta da Bia'])
  })

  it('cannot write a row into another user’s space (composite FKs)', async () => {
    const code = await sqlState(
      sql`insert into banks (id, user_id, space_id, name, sort)
          values (${randomUUID()}, ${ANA}, ${bia.spaceId}, 'x', 0)`,
    )
    expect(code).toBe('23503')
  })

  it('leaves the API roles with nothing', async () => {
    const rows = await owner().transaction(async (tx) => {
      await tx.execute(sql`set local role authenticated`)
      const result = await tx.execute<{ n: number }>(
        sql`select (select count(*) from spaces)::int + (select count(*) from categories)::int as n`,
      )
      return result.rows
    })
    expect(rows).toEqual([{ n: 0 }])
  })
})
