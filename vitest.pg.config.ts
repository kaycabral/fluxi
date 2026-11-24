import { readLocalSupabase } from '@cbrl/supabase/local'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

import { testDatabaseUrl } from './src/db/test-database'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

// Postgres integration suite: runs against a REAL database so constraints are
// proven natively, but NEVER the dev database: it truncates every table and
// deletes every auth user between tests. `POSTGRES_URL` (else the local
// Supabase stack) only names the server; the suite always runs on its own
// `fluxi_test` database there, created + migrated by `vitest.pg.setup.ts`.
// Files share that database, hence no file parallelism.
const testUrl = testDatabaseUrl(process.env.POSTGRES_URL || readLocalSupabase().dbUrl)
process.env.POSTGRES_URL = testUrl

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(here, 'src'),
      // Adapters import `server-only` (via `@/lib/db`); outside Next it throws.
      'server-only': require.resolve('@cbrl/testing/vitest/server-only-shim'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.pg.test.ts'],
    globalSetup: ['./vitest.pg.setup.ts'],
    env: { POSTGRES_URL: testUrl },
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
})
