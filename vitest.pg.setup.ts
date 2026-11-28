import { prepareTestDatabase } from './src/db/test-database'

/**
 * Create + migrate the dedicated test database before the suite (idempotent),
 * as the owner. `vitest.pg.config.ts` already pointed `POSTGRES_OWNER_URL` at
 * it and `POSTGRES_URL` at the runtime role.
 */
export default async function setup(): Promise<void> {
  const ownerUrl = process.env.POSTGRES_OWNER_URL
  if (ownerUrl === undefined) throw new Error('POSTGRES_OWNER_URL is not set')
  await prepareTestDatabase(ownerUrl)
}
