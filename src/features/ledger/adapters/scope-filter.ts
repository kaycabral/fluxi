import type { Scope } from '@/features/spaces/core/space'
import { eq, sql, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'

export type { Scope } from '@/features/spaces/core/space'

/** `user_id = scope.userId and space_id = scope.spaceId`: the filter of every ledger statement. */
export function inScope(table: { userId: PgColumn; spaceId: PgColumn }, scope: Scope): SQL {
  return sql`(${eq(table.userId, scope.userId)} and ${eq(table.spaceId, scope.spaceId)})`
}

/** The ownership columns of a row inserted in `scope`. */
export const owned = (scope: Scope) => ({ userId: scope.userId, spaceId: scope.spaceId })
