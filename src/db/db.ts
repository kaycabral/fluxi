import { supabaseSsl } from '@cbrl/pg'
import { createDrizzleDatabase } from '@cbrl/pg/drizzle'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as ledgerSchema from './schema'
import * as bankFeedSchema from './schema-bank-feed'

/** `drizzle/`, shared with the owner connection in `./owner`. */
export const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../drizzle',
)

export const fluxiSchemaModules = { ...ledgerSchema, ...bankFeedSchema }

/**
 * Postgres for fluxi (Supabase in production, the local Supabase stack in
 * dev/tests): Drizzle on the `@cbrl/pg` registered pool (bounded timeouts,
 * idle-error handler, process-wide registry). Nothing opens until first use.
 *
 * `FLUXI_DATABASE_URL` logs in as the runtime role `fluxi_app` (migration
 * 0034): not the table owner, no RLS bypass, DML on the app tables only. Never
 * point it at `postgres` (`POSTGRES_URL`, injected by the Supabase ↔ Vercel
 * integration), which is for migrations, seeds and fixtures only.
 *
 * Password mode only, transaction pooler (port 6543). Supabase hosts are
 * verified against the pinned root CA (`supabaseSsl`), and the URL's `ssl*`
 * params are stripped so they cannot override that pin.
 *
 * `fluxiDb.migrate()` applies `drizzle/`: used by the integration suite, local
 * dev and E2E; production runs `pnpm db:migrate` from CI.
 * Never call it at app boot, and never `drizzle-kit push` against production.
 */
export const fluxiDb = createDrizzleDatabase({
  connectionStringEnvVar: 'FLUXI_DATABASE_URL',
  database: 'fluxi',
  ssl: supabaseSsl,
  schema: fluxiSchemaModules,
  migrationsFolder,
})

export type FluxiDb = ReturnType<typeof fluxiDb.db>
