import { prepareTestDatabase } from './src/db/test-database'

/**
 * Create + migrate the dedicated test database before the suite (idempotent).
 * `vitest.pg.config.ts` already pointed `POSTGRES_URL` at it.
 */
export default async function setup(): Promise<void> {
  const url = process.env.POSTGRES_URL
  if (url === undefined) throw new Error('POSTGRES_URL is not set')
  await prepareTestDatabase(url)
}
