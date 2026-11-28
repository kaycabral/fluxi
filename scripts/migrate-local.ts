// Apply the `drizzle/` migrations to the LOCAL Supabase stack (run by
// `pnpm db:start`) and let the app's runtime role (`fluxi_app`, migration 0034)
// log in with its local password, so local dev and E2E connect as it, like
// production. Production runs `pnpm db:migrate` from CI.

import { fluxiDb } from '@/db'
import { LOCAL_APP_LOGIN, localAppUrl } from '@/db/local-app-role'
import { readLocalSupabase } from '@cbrl/supabase/local'
import pg from 'pg'

async function main(): Promise<void> {
  const { dbUrl } = readLocalSupabase()
  // Refuses a non-local stack before touching it.
  localAppUrl(dbUrl)
  await fluxiDb.migrate({ connectionString: dbUrl })
  const client = new pg.Client({ connectionString: dbUrl })
  await client.connect()
  try {
    await client.query(LOCAL_APP_LOGIN)
  } finally {
    await client.end()
  }
  console.log('fluxi migrations applied to the local stack (fluxi_app can log in)')
}

main().catch((err: unknown) => {
  console.error(err)
  process.exitCode = 1
})
