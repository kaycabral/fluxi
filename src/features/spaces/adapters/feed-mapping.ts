import 'server-only'

import { accounts, banks } from '@/db/schema'
import { bankFeedAccounts, bankFeedItems } from '@/db/schema-bank-feed'
import {
  compatibleTypes,
  createdTypeFor,
  type MapFeedAccountInput,
} from '@/features/bank-feed/core/mapping'
import { fluxiDb } from '@/lib/db'
import { and, eq, isNull, sql } from 'drizzle-orm'
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
  feed: { spaceId: string; type: string; name: string; institution: string; label: string | null },
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
  // "Criar conta": a bank named after the connection (reused when it exists).
  const bankName = (feed.label ?? feed.institution).slice(0, 80)
  const [existing] = await tx
    .select({ id: banks.id })
    .from(banks)
    .where(
      and(
        eq(banks.userId, userId),
        eq(banks.spaceId, feed.spaceId),
        eq(banks.name, bankName),
        isNull(banks.archivedAt),
      ),
    )
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
    name: feed.name.slice(0, 80),
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
        type: bankFeedAccounts.type,
        name: bankFeedAccounts.name,
        institution: bankFeedAccounts.institution,
        accountId: bankFeedAccounts.accountId,
        label: bankFeedItems.label,
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
    if (accountId !== feed.accountId) {
      await unmaterialize(tx, userId, feed.id)
      await tx
        .update(bankFeedAccounts)
        .set({ accountId, updatedAt: sql`now()` })
        .where(and(eq(bankFeedAccounts.id, feed.id), eq(bankFeedAccounts.userId, userId)))
    }
    await tx.execute(
      sql`select private.materialize_bank_feed(${userId}::uuid, ${feed.spaceId}::uuid, ${today}::date)`,
    )
    return { ok: true }
  })
}
