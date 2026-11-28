import { supabaseSsl } from '@cbrl/pg'
import { createDrizzleDatabase } from '@cbrl/pg/drizzle'
import { fluxiSchemaModules, migrationsFolder } from './db'

/**
 * Owner connection (`POSTGRES_URL`, the `postgres` user, which bypasses RLS):
 * migrations, local seeds and test fixtures only. The app never imports it;
 * `@/db` does not re-export this module.
 */
export const ownerDb = createDrizzleDatabase({
  connectionStringEnvVar: 'POSTGRES_URL',
  database: 'fluxi-owner',
  ssl: supabaseSsl,
  schema: fluxiSchemaModules,
  migrationsFolder,
})
