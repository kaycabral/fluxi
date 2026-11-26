import 'server-only'

import { personalScope } from '@/db/queries/spaces'
import { accounts, banks, spaces } from '@/db/schema'
import { bankFeedAccounts, bankFeedItems, bankTransactions } from '@/db/schema-bank-feed'
import {
  cardStatusOf,
  HOLDER_TYPES,
  type CardStatus,
  type HolderType,
} from '@/features/bank-feed/core/pluggy'
import {
  DEFAULT_SPACE_ICON,
  isSpaceIcon,
  pickActiveSpace,
  type CreateSpaceInput,
  type Scope,
  type Space,
  type SpaceIconKey,
  type UpdateSpaceInput,
} from '@/features/spaces/core/space'
import { fluxiDb } from '@/lib/db'
import { and, asc, count, eq, isNull, ne, sql } from 'drizzle-orm'

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
    // The check constraint only admits known keys; a stray one falls back to the default look.
    icon: isSpaceIcon(r.icon) ? r.icon : fallbackIcon(r.kind),
    archived: r.archivedAt !== null,
  }))
}

function fallbackIcon(kind: Space['kind']): SpaceIconKey {
  return kind === 'personal' ? 'user' : DEFAULT_SPACE_ICON
}

/**
 * The user's personal space, created (and seeded) when missing — the auth
 * trigger always creates it, so this only heals an unexpected gap.
 */
export async function ensurePersonalSpace(userId: string): Promise<string> {
  return (await personalScope(db(), userId)).spaceId
}

/** Create a (non-personal) space and seed its defaults (budget groups, budget version, categories, settings) atomically. */
export async function createSpace(
  userId: string,
  input: Pick<CreateSpaceInput, 'name'> & { id: string; icon?: SpaceIconKey },
): Promise<void> {
  await db().transaction(async (tx) => {
    const inserted = await tx
      .insert(spaces)
      .values({
        id: input.id,
        userId,
        name: input.name,
        kind: 'business',
        icon: input.icon ?? DEFAULT_SPACE_ICON,
        sort: sql`(select coalesce(max(${spaces.sort}) + 1, 1) from ${spaces} where ${spaces.userId} = ${userId})`,
      })
      .onConflictDoNothing({ target: spaces.id })
      .returning({ id: spaces.id })
    // A replay (same id) is a no-op; seeding is idempotent anyway.
    if (inserted.length === 0) return
    await tx.execute(sql`select public.seed_space_defaults(${input.id}::uuid)`)
  })
}

/** Rename one of the user's spaces and change its icon (the personal one included). */
export async function updateSpace(
  userId: string,
  { id: spaceId, name, icon }: UpdateSpaceInput,
): Promise<boolean> {
  const rows = await db()
    .update(spaces)
    .set({ name, icon, updatedAt: sql`now()` })
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
  /** Who chose the space (`auto` = the sync's routing, `manual` = the user; null = nobody yet). */
  spaceSource: 'auto' | 'manual' | null
  /** Name offered for a new space while an unknown company's connection waits for one. */
  suggestedSpaceName: string | null
  /** Names of the feed accounts synced from this connection (any space). */
  accounts: string[]
  /** Transactions stored for this connection (any space): what a move carries along. */
  transactionCount: number
  /** The connection's feed accounts in its current space, with their mapping. */
  feedAccounts: FeedAccountView[]
}

/** A bank feed account as "Conexões" shows it. */
export type FeedAccountView = {
  id: string
  name: string
  /** `BANK` or `CREDIT`. */
  type: string
  subtype: string
  /** Last balance the bank reported (a card's open bill, positive = owed). */
  balanceCents: number
  /** Last 4 digits of the bank account / card ("••4821"). */
  numberHint: string | null
  accountId: string | null
  /** Who decided the mapping (`auto` / `manual`; null = nobody yet). */
  mappingSource: 'auto' | 'manual' | null
  /** Ledger entries materialized from it (what an unmap/remap deletes). */
  entryCount: number
  /** Bank transactions stored for it (zero with a zero balance = "sem movimento"). */
  transactionCount: number
  /** Date (`YYYY-MM-DD`) of its latest stored transaction; null = none in the synced window. */
  lastMovement: string | null
  /** A card's status from Pluggy; null for bank accounts or when unknown. */
  cardStatus: CardStatus | null
  /** Holder kind (`person`/`company`); null when unknown. */
  holderType: HolderType | null
}

/** An active fluxi account a feed account can be mapped to. */
export type MappableAccount = {
  id: string
  spaceId: string
  bankName: string
  name: string
  type: string
}

/** The user's active fluxi accounts (every space), for the mapping pickers. */
export async function listMappableAccounts(userId: string): Promise<MappableAccount[]> {
  const rows = await db()
    .select({
      id: accounts.id,
      spaceId: accounts.spaceId,
      bankName: banks.name,
      name: accounts.name,
      type: accounts.type,
    })
    .from(accounts)
    .innerJoin(banks, eq(banks.id, accounts.bankId))
    .where(and(eq(accounts.userId, userId), isNull(accounts.archivedAt)))
    .orderBy(asc(banks.sort), asc(banks.name), asc(accounts.name))
  return rows
}

/** The user's bank connections with the accounts and transactions stored for each. */
export async function listFeedItems(userId: string): Promise<FeedItem[]> {
  const [items, accounts, counts] = await Promise.all([
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
    db()
      .select({ itemId: bankFeedAccounts.itemId, count: count(bankTransactions.id) })
      .from(bankTransactions)
      .innerJoin(
        bankFeedAccounts,
        and(
          eq(bankFeedAccounts.id, bankTransactions.feedAccountId),
          eq(bankFeedAccounts.userId, userId),
        ),
      )
      .where(eq(bankTransactions.userId, userId))
      .groupBy(bankFeedAccounts.itemId),
  ])
  const feeds = await db()
    .select({
      id: bankFeedAccounts.id,
      itemId: bankFeedAccounts.itemId,
      spaceId: bankFeedAccounts.spaceId,
      name: bankFeedAccounts.name,
      type: bankFeedAccounts.type,
      subtype: bankFeedAccounts.subtype,
      balanceCents: bankFeedAccounts.balanceCents,
      numberHint: bankFeedAccounts.numberHint,
      accountId: bankFeedAccounts.accountId,
      mappingSource: bankFeedAccounts.mappingSource,
      cardStatus: bankFeedAccounts.cardStatus,
      holderType: bankFeedAccounts.holderType,
      lastMovement: sql<string | null>`(
        select max(t.date)::text from bank_transactions t
        where t.feed_account_id = "bank_feed_accounts"."id" and t.user_id = ${userId}
      )`,
      transactionCount: sql<number>`(
        select count(*)::int from bank_transactions t
        where t.feed_account_id = "bank_feed_accounts"."id" and t.user_id = ${userId}
      )`.mapWith(Number),
      entryCount: sql<number>`(
        select count(distinct l.entry_id)::int from bank_entry_links l
        join bank_transactions t on t.id = l.bank_transaction_id
        where t.feed_account_id = "bank_feed_accounts"."id" and l.user_id = ${userId}
      )`.mapWith(Number),
    })
    .from(bankFeedAccounts)
    .where(eq(bankFeedAccounts.userId, userId))
    .orderBy(asc(bankFeedAccounts.type), asc(bankFeedAccounts.name))
  return items.map((item) => ({
    itemId: item.itemId,
    label: item.label,
    spaceId: item.spaceId,
    spaceSource: mappingSourceOf(item.spaceSource),
    suggestedSpaceName: item.suggestedSpaceName,
    accounts: accounts.filter((a) => a.itemId === item.itemId).map((a) => a.name),
    transactionCount: counts.find((c) => c.itemId === item.itemId)?.count ?? 0,
    feedAccounts: feeds
      .filter((f) => f.itemId === item.itemId && f.spaceId === item.spaceId)
      .map(
        ({ itemId: _item, spaceId: _space, mappingSource, cardStatus, holderType, ...view }) => ({
          ...view,
          mappingSource: mappingSourceOf(mappingSource),
          cardStatus: cardStatusOf(cardStatus),
          holderType: holderTypeFrom(holderType),
        }),
      ),
  }))
}

function mappingSourceOf(value: string | null): FeedAccountView['mappingSource'] {
  return value === 'auto' || value === 'manual' ? value : null
}

function holderTypeFrom(value: string | null): HolderType | null {
  return HOLDER_TYPES.find((h) => h === value) ?? null
}

export type Tx = Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0]

/**
 * Route one of the user's bank connections to one of the user's active spaces
 * (or unassign it with null) and, when it gets a space, move everything
 * already synced from it there, in one transaction. A moved feed account loses
 * its mapping (`account_id`): a fluxi account of the old space cannot be
 * referenced from the new one. When the destination already holds the same
 * external account (an earlier move back and forth), the two are merged: the
 * destination row is kept and only the transactions it lacks (by external id)
 * move. Unassigning keeps the stored data where it is. Ledger entries never move:
 * the ones materialized from the moved transactions are deleted (the next sync
 * materializes them in the new space once its feed accounts are mapped).
 * With a space, the space is materialized right away
 * (`private.materialize_bank_feed`): its feed accounts with movement are
 * auto-linked and their transactions become entries.
 */
export async function assignFeedItem(
  userId: string,
  itemId: string,
  spaceId: string | null,
  today: string,
): Promise<boolean> {
  return db().transaction(async (tx) => {
    if (spaceId !== null) {
      const [own] = await tx
        .select({ id: spaces.id })
        .from(spaces)
        .where(and(eq(spaces.id, spaceId), eq(spaces.userId, userId), isNull(spaces.archivedAt)))
      if (own === undefined) return false
    }
    const rows = await tx
      .update(bankFeedItems)
      // The user's choice (pausing included) wins over the sync's routing forever.
      .set({ spaceId, spaceSource: 'manual', suggestedSpaceName: null, updatedAt: sql`now()` })
      .where(and(eq(bankFeedItems.userId, userId), eq(bankFeedItems.itemId, itemId)))
      .returning({ itemId: bankFeedItems.itemId })
    if (rows.length === 0) return false
    if (spaceId !== null) {
      await moveFeedAccounts(tx, userId, itemId, spaceId)
      await tx.execute(
        sql`select private.materialize_bank_feed(${userId}::uuid, ${spaceId}::uuid, ${today}::date)`,
      )
    }
    return true
  })
}

/**
 * Move the item's feed accounts (and their transactions) into `spaceId`. The
 * transactions' FK is `(feed_account_id, space_id)`, so they move by being
 * re-pointed at a feed account that already lives in the destination: the
 * existing twin (merge) or a fresh copy; the emptied source is then deleted
 * (its cascade drops only duplicates the destination already had).
 */
async function moveFeedAccounts(tx: Tx, userId: string, itemId: string, spaceId: string) {
  const sources = await tx
    .select()
    .from(bankFeedAccounts)
    .where(
      and(
        eq(bankFeedAccounts.userId, userId),
        eq(bankFeedAccounts.itemId, itemId),
        ne(bankFeedAccounts.spaceId, spaceId),
      ),
    )
    .for('update')
  for (const source of sources) {
    const [existing] = await tx
      .select({ id: bankFeedAccounts.id })
      .from(bankFeedAccounts)
      .where(
        and(
          eq(bankFeedAccounts.userId, userId),
          eq(bankFeedAccounts.spaceId, spaceId),
          eq(bankFeedAccounts.source, source.source),
          eq(bankFeedAccounts.externalId, source.externalId),
        ),
      )
      .for('update')
    await unmaterialize(tx, userId, source.id)
    const targetId = existing?.id ?? (await copyFeedAccount(tx, source, spaceId))
    await tx
      .update(bankTransactions)
      .set({ feedAccountId: targetId, spaceId, updatedAt: sql`now()` })
      .where(
        and(
          eq(bankTransactions.userId, userId),
          eq(bankTransactions.feedAccountId, source.id),
          sql`not exists (
            select 1 from ${bankTransactions} as kept
            where kept.user_id = ${userId}
              and kept.feed_account_id = ${targetId}
              and kept.external_id = ${bankTransactions.externalId}
          )`,
        ),
      )
    await tx
      .delete(bankFeedAccounts)
      .where(and(eq(bankFeedAccounts.userId, userId), eq(bankFeedAccounts.id, source.id)))
  }
}

/**
 * The ledger entries materialized from a feed account's transactions belong
 * to the space it leaves: delete them with their links (a transfer's other
 * link too, so its transaction is materialized again on its own), never
 * leaving a link pointing across spaces. Also used when a feed account is
 * unmapped or remapped (`mapFeedAccount`).
 */
export async function unmaterialize(tx: Tx, userId: string, feedAccountId: string) {
  const { rows } = await tx.execute<{ entry_id: string | null }>(sql`
    delete from bank_entry_links l
    using bank_transactions t
    where t.id = l.bank_transaction_id and t.user_id = ${userId}
      and t.feed_account_id = ${feedAccountId} and l.user_id = ${userId}
    returning l.entry_id`)
  const entryIds = rows.flatMap((r) => (r.entry_id === null ? [] : [r.entry_id]))
  if (entryIds.length === 0) return
  const ids = `{${entryIds.join(',')}}`
  await tx.execute(
    sql`delete from bank_entry_links where user_id = ${userId} and entry_id = any(${ids}::uuid[])`,
  )
  await tx.execute(sql`delete from entries where user_id = ${userId} and id = any(${ids}::uuid[])`)
}

async function copyFeedAccount(
  tx: Tx,
  source: typeof bankFeedAccounts.$inferSelect,
  spaceId: string,
): Promise<string> {
  const [copy] = await tx
    .insert(bankFeedAccounts)
    .values({
      userId: source.userId,
      spaceId,
      source: source.source,
      externalId: source.externalId,
      itemId: source.itemId,
      institution: source.institution,
      name: source.name,
      type: source.type,
      subtype: source.subtype,
      balanceCents: source.balanceCents,
      numberHint: source.numberHint,
      cardStatus: source.cardStatus,
      holderType: source.holderType,
      holderKey: source.holderKey,
      // A fluxi account of the old space cannot be referenced from the new one;
      // the mapping is decided again there (auto-link included).
      accountId: null,
      mappingSource: null,
      syncedAt: source.syncedAt,
    })
    .returning({ id: bankFeedAccounts.id })
  if (copy === undefined) throw new Error('feed account copy was not inserted')
  return copy.id
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
