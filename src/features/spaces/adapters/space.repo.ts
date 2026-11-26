import 'server-only'

import { personalScope } from '@/db/queries/spaces'
import { spaces } from '@/db/schema'
import { bankFeedAccounts, bankFeedItems } from '@/db/schema-bank-feed'
import {
  pickActiveSpace,
  type CreateSpaceInput,
  type Scope,
  type Space,
} from '@/features/spaces/core/space'
import { fluxiDb } from '@/lib/db'
import { and, asc, eq, isNull, ne, sql } from 'drizzle-orm'

/**
 * The user's spaces and bank connections. Every query is scoped by the
 * session `userId`: a space id from a cookie or a payload is only ever matched
 * against the user's own spaces.
 */

const db = () => fluxiDb.db()

export async function listSpaces(userId: string): Promise<Space[]> {
  const rows = await db()
    .select()
    .from(spaces)
    .where(eq(spaces.userId, userId))
    .orderBy(asc(spaces.sort), asc(spaces.createdAt))
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    kind: r.kind,
    archived: r.archivedAt !== null,
  }))
}

/**
 * The user's personal space, created (and seeded) when missing — the auth
 * trigger always creates it, so this only heals an unexpected gap.
 */
export async function ensurePersonalSpace(userId: string): Promise<string> {
  return (await personalScope(db(), userId)).spaceId
}

/** Create a business space and seed its defaults (pots, plan, categories, settings) atomically. */
export async function createSpace(
  userId: string,
  input: CreateSpaceInput & { id: string },
): Promise<void> {
  await db().transaction(async (tx) => {
    const inserted = await tx
      .insert(spaces)
      .values({
        id: input.id,
        userId,
        name: input.name,
        kind: input.kind,
        sort: sql`(select coalesce(max(${spaces.sort}) + 1, 1) from ${spaces} where ${spaces.userId} = ${userId})`,
      })
      .onConflictDoNothing({ target: spaces.id })
      .returning({ id: spaces.id })
    // A replay (same id) is a no-op; seeding is idempotent anyway.
    if (inserted.length === 0) return
    await tx.execute(sql`select public.seed_space_defaults(${input.id}::uuid)`)
  })
}

/** Rename one of the user's spaces. */
export async function renameSpace(userId: string, spaceId: string, name: string): Promise<boolean> {
  const rows = await db()
    .update(spaces)
    .set({ name, updatedAt: sql`now()` })
    .where(and(eq(spaces.id, spaceId), eq(spaces.userId, userId)))
    .returning({ id: spaces.id })
  return rows.length > 0
}

/** Archive a (non-personal) space: hidden from the switcher, data kept. */
export async function archiveSpace(userId: string, spaceId: string): Promise<boolean> {
  const rows = await db()
    .update(spaces)
    .set({ archivedAt: sql`coalesce(${spaces.archivedAt}, now())`, updatedAt: sql`now()` })
    .where(and(eq(spaces.id, spaceId), eq(spaces.userId, userId), ne(spaces.kind, 'personal')))
    .returning({ id: spaces.id })
  return rows.length > 0
}

export type FeedItem = {
  itemId: string
  label: string | null
  spaceId: string | null
  /** Names of the feed accounts synced from this connection (any space). */
  accounts: string[]
}

/** The user's bank connections with the accounts seen on each. */
export async function listFeedItems(userId: string): Promise<FeedItem[]> {
  const [items, accounts] = await Promise.all([
    db()
      .select()
      .from(bankFeedItems)
      .where(eq(bankFeedItems.userId, userId))
      .orderBy(asc(bankFeedItems.createdAt), asc(bankFeedItems.itemId)),
    db()
      .selectDistinct({ itemId: bankFeedAccounts.itemId, name: bankFeedAccounts.name })
      .from(bankFeedAccounts)
      .where(eq(bankFeedAccounts.userId, userId))
      .orderBy(asc(bankFeedAccounts.name)),
  ])
  return items.map((item) => ({
    itemId: item.itemId,
    label: item.label,
    spaceId: item.spaceId,
    accounts: accounts.filter((a) => a.itemId === item.itemId).map((a) => a.name),
  }))
}

/**
 * Route one of the user's bank connections to one of the user's active spaces
 * (or unassign it with null). Only future syncs follow; nothing moves.
 */
export async function assignFeedItem(
  userId: string,
  itemId: string,
  spaceId: string | null,
): Promise<boolean> {
  if (spaceId !== null) {
    const [own] = await db()
      .select({ id: spaces.id })
      .from(spaces)
      .where(and(eq(spaces.id, spaceId), eq(spaces.userId, userId), isNull(spaces.archivedAt)))
    if (own === undefined) return false
  }
  const rows = await db()
    .update(bankFeedItems)
    .set({ spaceId, updatedAt: sql`now()` })
    .where(and(eq(bankFeedItems.userId, userId), eq(bankFeedItems.itemId, itemId)))
    .returning({ itemId: bankFeedItems.itemId })
  return rows.length > 0
}

export type ServerScope = Scope & { space: Space; spaces: Space[] }

/** The scope of `userId` for the space id it asked for (cookie or payload): `requested` is the untrusted space id. */
export async function resolveScope(
  userId: string,
  requested: string | undefined,
): Promise<ServerScope> {
  let spaces = await listSpaces(userId)
  let space = pickActiveSpace(spaces, requested)
  if (space === null) {
    await ensurePersonalSpace(userId)
    spaces = await listSpaces(userId)
    space = pickActiveSpace(spaces, requested)
    if (space === null) throw new Error('user has no personal space')
  }
  return { userId, spaceId: space.id, space, spaces }
}
