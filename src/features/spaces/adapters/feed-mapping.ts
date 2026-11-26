import 'server-only'

import { accounts, banks } from '@/db/schema'
import { bankFeedAccounts, bankFeedItems } from '@/db/schema-bank-feed'
import {
  aliasesOf,
  feedAccountShortLabel,
  institutionOf,
  normalizeName,
} from '@/features/bank-feed/core/institution'
import {
  compatibleTypes,
  createdTypeFor,
  type MapFeedAccountInput,
} from '@/features/bank-feed/core/mapping'
import { fluxiDb } from '@/lib/db'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { unmaterialize, type Tx } from './space.repo'

/**
 * "Conta no Fluxi" of a bank feed account (Configurações → Conexões). In one
 * transaction: check the feed account is the user's and its connection is
 * routed to its space; resolve the target (an active account of that space of
 * a compatible type, a new one, or none); when the mapping changes, delete
 * what the feed account had materialized (entries and links); save the
 * mapping and materialize the space right away (`private.materialize_bank_feed`,
 * executed by the app's own role, the function's owner). The old account
 * stops being anchored: its opening balance stays as it was.
 */

export type MapFailure = 'not_found' | 'invalid_account'
export type MapResult = { ok: true } | { ok: false; reason: MapFailure }

async function resolveTarget(
  tx: Tx,
  userId: string,
  feed: {
    spaceId: string
    itemId: string
    type: string
    subtype: string
    name: string
  },
  target: MapFeedAccountInput['target'],
): Promise<{ accountId: string | null } | 'invalid'> {
  if (target.kind === 'none') return { accountId: null }
  if (target.kind === 'account') {
    const [account] = await tx
      .select({ id: accounts.id, type: accounts.type })
      .from(accounts)
      .where(
        and(
          eq(accounts.id, target.accountId),
          eq(accounts.userId, userId),
          eq(accounts.spaceId, feed.spaceId),
          isNull(accounts.archivedAt),
        ),
      )
    if (account === undefined || !compatibleTypes(feed.type).includes(account.type)) {
      return 'invalid'
    }
    return { accountId: account.id }
  }
  // "Criar conta": a bank named after the connection's institution (reused
  // when one of the space is named like it), the account after the feed's.
  const siblings = await tx
    .select({ name: bankFeedAccounts.name })
    .from(bankFeedAccounts)
    .where(
      and(
        eq(bankFeedAccounts.userId, userId),
        eq(bankFeedAccounts.spaceId, feed.spaceId),
        eq(bankFeedAccounts.itemId, feed.itemId),
      ),
    )
    .orderBy(asc(bankFeedAccounts.type), asc(bankFeedAccounts.name), asc(bankFeedAccounts.id))
  const institution = institutionOf(siblings.map((s) => s.name))
  const bankName = institution.slice(0, 80)
  const aliases = aliasesOf(institution)
  const spaceBanks = await tx
    .select({ id: banks.id, name: banks.name })
    .from(banks)
    .where(and(eq(banks.userId, userId), eq(banks.spaceId, feed.spaceId), isNull(banks.archivedAt)))
    .orderBy(asc(banks.sort), asc(banks.createdAt), asc(banks.id))
  const existing = spaceBanks.find((b) => aliases.includes(normalizeName(b.name.trim())))
  const bankId = existing?.id ?? randomUUID()
  if (existing === undefined) {
    const [next] = await tx
      .select({ sort: sql<number>`coalesce(max(${banks.sort}), -1) + 1` })
      .from(banks)
      .where(and(eq(banks.userId, userId), eq(banks.spaceId, feed.spaceId)))
    await tx
      .insert(banks)
      .values({ id: bankId, userId, spaceId: feed.spaceId, name: bankName, sort: next?.sort ?? 0 })
  }
  const accountId = randomUUID()
  await tx.insert(accounts).values({
    id: accountId,
    userId,
    spaceId: feed.spaceId,
    bankId,
    name: feedAccountShortLabel(institution, feed).slice(0, 80),
    type: createdTypeFor(feed.type),
    openingBalanceCents: 0,
  })
  return { accountId }
}

export function mapFeedAccount(
  userId: string,
  input: MapFeedAccountInput,
  today: string,
): Promise<MapResult> {
  return fluxiDb.db().transaction(async (tx) => {
    const [feed] = await tx
      .select({
        id: bankFeedAccounts.id,
        spaceId: bankFeedAccounts.spaceId,
        itemId: bankFeedAccounts.itemId,
        type: bankFeedAccounts.type,
        subtype: bankFeedAccounts.subtype,
        name: bankFeedAccounts.name,
        accountId: bankFeedAccounts.accountId,
      })
      .from(bankFeedAccounts)
      .innerJoin(
        bankFeedItems,
        and(
          eq(bankFeedItems.userId, bankFeedAccounts.userId),
          eq(bankFeedItems.itemId, bankFeedAccounts.itemId),
          eq(bankFeedItems.spaceId, bankFeedAccounts.spaceId),
        ),
      )
      .where(and(eq(bankFeedAccounts.id, input.feedAccountId), eq(bankFeedAccounts.userId, userId)))
      .for('update', { of: bankFeedAccounts })
    if (feed === undefined) return { ok: false, reason: 'not_found' }
    const resolved = await resolveTarget(tx, userId, feed, input.target)
    if (resolved === 'invalid') return { ok: false, reason: 'invalid_account' }
    const { accountId } = resolved
    if (accountId !== feed.accountId) await unmaterialize(tx, userId, feed.id)
    // Any choice here is the user's, kept forever: the auto-link never
    // touches it again (not even "Não vincular").
    await tx
      .update(bankFeedAccounts)
      .set({ accountId, mappingSource: 'manual', updatedAt: sql`now()` })
      .where(and(eq(bankFeedAccounts.id, feed.id), eq(bankFeedAccounts.userId, userId)))
    await tx.execute(
      sql`select private.materialize_bank_feed(${userId}::uuid, ${feed.spaceId}::uuid, ${today}::date)`,
    )
    return { ok: true }
  })
}
