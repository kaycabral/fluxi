import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const here = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

// Postgres integration suite: runs against a REAL database from
// `POSTGRES_URL` (the local Supabase stack — it ships the `auth` and `storage`
// schemas the migrations reference)
// so constraints are proven natively. Files share one database and truncate
// between tests, hence no file parallelism.
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
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
})
