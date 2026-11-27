import { coverageBase } from '@cbrl/testing/vitest'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

const here = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(here, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // The ledger UI tests drive whole Radix flows (sheet → select → dialog).
    testTimeout: 15_000,
    // `readBackend` (`@cbrl/next/server`) logs through `@cbrl/log`: inlining the
    // package lets `vi.mock('@cbrl/log')` reach its import.
    server: { deps: { inline: ['@cbrl/next'] } },
    include: ['src/**/*.test.{ts,tsx}'],
    // The Postgres suite needs the local Supabase stack: `vitest.pg.config.ts`.
    exclude: [...configDefaults.exclude, 'src/**/*.pg.test.ts'],
    // Unit-coverage ratchet (autoUpdate = one-way, só sobe). O seed honesto é
    // gravado pelo primeiro run com --coverage; piso anti-regressão depois.
    // Re-semeado ao criar o fluxi a partir do baseline do imovil (sem o domínio).
    coverage: {
      ...coverageBase(),
      // `src/db` and the feature adapters are proven by the Postgres suite
      // (`vitest.pg.config.ts`), not by this one: counting their queries here
      // would only dilute the ratchet.
      exclude: [...coverageBase().exclude, 'src/db/**', 'src/features/*/adapters/**'],
      thresholds: {
        statements: 97.96,
        branches: 94.98,
        functions: 97.78,
        lines: 98.22,
        autoUpdate: true,
      },
    },
  },
})
