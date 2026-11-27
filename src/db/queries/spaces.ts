import type { Scope } from '@/features/spaces/core/space'
import { sql } from 'drizzle-orm'
import type { FluxiDb } from '../db'

/**
 * The scope of `userId`'s personal space (created and seeded by the auth
 * trigger; `ensure_personal_space` heals a missing one and leaves an existing
 * one untouched). For scripts (dev seed), tests and E2E: the
 * app resolves its scope from the session (`getServerScope`).
 */
export async function personalScope(db: FluxiDb, userId: string): Promise<Scope> {
  const result = await db.execute<{ id: string }>(
    sql`select public.ensure_personal_space(${userId}::uuid) as id`,
  )
  const spaceId = result.rows[0]?.id
  if (spaceId === undefined) throw new Error('personal space missing')
  return { userId, spaceId }
}
