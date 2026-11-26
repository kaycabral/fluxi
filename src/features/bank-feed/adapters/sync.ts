import postgres, { type Sql } from 'postgres'
import {
  coveredFrom,
  itemReadiness,
  PLUGGY_SOURCE,
  toFeedAccount,
  toFeedTransaction,
} from '../core/pluggy.ts'
import { syncFeedAccount } from './feed.write.ts'
import { createPluggyClient, type PluggyClient } from './pluggy.client.ts'

/**
 * THE bank sync: the `pluggy-sync` Supabase Edge Function is a thin `Deno.serve`
 * around {@link handleSyncRequest}. Runtime-agnostic on purpose (web `fetch`,
 * `Request`/`Response`, `crypto.subtle`, postgres.js; relative imports with
 * extensions), so Deno runs this exact module and Node tests it.
 *
 * Security posture (decided after a review): the Pluggy secret and the bank
 * data never leave Supabase; the database is reached as `fluxi_sync`, a role
 * that can only touch the feed tables; the target user is a configured id,
 * never looked up; each connection (item) is recorded in `bank_feed_items`
 * and synced only once the user routed it to one of their spaces (unassigned
 * items are reported and nothing of them is stored); the caller (pg_cron via pg_net) must present a
 * dedicated token. Output and logs carry aggregates only — never credentials,
 * descriptions or single amounts.
 */

export const TOKEN_HEADER = 'x-fluxi-sync-token'

export type SyncEnv = {
  pluggyClientId: string
  pluggyClientSecret: string
  itemIds: string[]
  userId: string
  dbUrl: string
  token: string
}

const ENV_KEYS = {
  pluggyClientId: 'PLUGGY_CLIENT_ID',
  pluggyClientSecret: 'PLUGGY_CLIENT_SECRET',
  itemIds: 'PLUGGY_ITEM_IDS',
  userId: 'FLUXI_SYNC_USER_ID',
  dbUrl: 'FLUXI_SYNC_DB_URL',
  token: 'FLUXI_SYNC_TOKEN',
} as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Shorter tokens are rejected as misconfiguration (32 random bytes, hex = 64). */
const MIN_TOKEN_LENGTH = 32

export type ParsedEnv = { ok: true; env: SyncEnv } | { ok: false; problems: string[] }

export function parseSyncEnv(raw: Readonly<Record<string, string | undefined>>): ParsedEnv {
  const read = (key: string) => raw[key]?.trim() ?? ''
  const itemIds = read(ENV_KEYS.itemIds)
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
  const env: SyncEnv = {
    pluggyClientId: read(ENV_KEYS.pluggyClientId),
    pluggyClientSecret: read(ENV_KEYS.pluggyClientSecret),
    itemIds,
    userId: read(ENV_KEYS.userId),
    dbUrl: read(ENV_KEYS.dbUrl),
    token: read(ENV_KEYS.token),
  }
  const problems = [
    !env.pluggyClientId && `missing ${ENV_KEYS.pluggyClientId}`,
    !env.pluggyClientSecret && `missing ${ENV_KEYS.pluggyClientSecret}`,
    itemIds.length === 0 && `missing ${ENV_KEYS.itemIds}`,
    !UUID.test(env.userId) && `${ENV_KEYS.userId} must be a uuid`,
    !env.dbUrl && `missing ${ENV_KEYS.dbUrl}`,
    env.token.length < MIN_TOKEN_LENGTH &&
      `${ENV_KEYS.token} must have at least ${MIN_TOKEN_LENGTH} characters`,
  ].filter((p): p is string => typeof p === 'string')
  return problems.length > 0 ? { ok: false, problems } : { ok: true, env }
}

async function sha256(value: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
}

/**
 * Constant-time token check: both sides are hashed first, so the comparison
 * always walks 32 bytes regardless of where (or whether) they differ.
 */
export async function tokenMatches(given: string | null, expected: string): Promise<boolean> {
  if (given === null || expected === '') return false
  const [a, b] = await Promise.all([sha256(given), sha256(expected)])
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  return diff === 0
}

export type AccountSummary = {
  item: number
  institution: string
  type: string
  subtype: string
  transactions: number
  pending: number
  removed: number
  from: string | null
  to: string | null
}

export type SkippedItem = { item: number; institution: string; status: string }

/** A configured item no space was chosen for yet ("Conexões bancárias"): not synced. */
export type UnassignedItem = { item: number; institution: string }

export type SyncSummary = {
  accounts: AccountSummary[]
  skipped: SkippedItem[]
  unassigned: UnassignedItem[]
}

export type SyncRun = {
  sql: Sql
  pluggy: PluggyClient
  userId: string
  itemIds: readonly string[]
  /** `YYYY-MM-DD` in America/Sao_Paulo. */
  today: string
}

/**
 * Record `itemId` (label = institution) and return the space it is routed to,
 * or null while the user has not assigned it.
 */
async function routeItem(
  sql: Sql,
  userId: string,
  itemId: string,
  label: string,
): Promise<string | null> {
  const [row] = await sql<{ space_id: string | null }[]>`
    insert into bank_feed_items (user_id, item_id, label)
    values (${userId}, ${itemId}, ${label})
    on conflict (user_id, item_id) do update set
      label = excluded.label,
      updated_at = now()
    returning space_id`
  return row?.space_id ?? null
}

/**
 * Item by item, account by account: only one account's transactions are in
 * memory at a time. Items that are not UPDATED yet, or not routed to a space,
 * are reported and skipped.
 */
export async function runPluggySync({
  sql,
  pluggy,
  userId,
  itemIds,
  today,
}: SyncRun): Promise<SyncSummary> {
  const summary: SyncSummary = { accounts: [], skipped: [], unassigned: [] }
  const from = coveredFrom(today)
  for (const [index, itemId] of itemIds.entries()) {
    const item = await pluggy.getItem(itemId)
    const institution = item.connector?.name ?? 'Pluggy'
    const spaceId = await routeItem(sql, userId, itemId, institution)
    if (spaceId === null) {
      summary.unassigned.push({ item: index + 1, institution })
      continue
    }
    const readiness = itemReadiness(item)
    if (!readiness.ready) {
      summary.skipped.push({ item: index + 1, institution, status: readiness.reason })
      continue
    }
    for (const account of await pluggy.listAccounts(itemId)) {
      const feed = toFeedAccount(account, institution)
      const rows = (await pluggy.listTransactions(account.id)).map(toFeedTransaction)
      const dates = rows.map((r) => r.date).sort()
      const counts = await syncFeedAccount(
        sql,
        { userId, spaceId },
        {
          source: PLUGGY_SOURCE,
          account: feed,
          transactions: rows,
          coveredFrom: from,
        },
      )
      summary.accounts.push({
        item: index + 1,
        institution,
        type: feed.type,
        subtype: feed.subtype,
        transactions: rows.length,
        pending: rows.filter((r) => r.status === 'PENDING').length,
        removed: counts.removed,
        from: dates[0] ?? null,
        to: dates.at(-1) ?? null,
      })
    }
  }
  return summary
}

/** `YYYY-MM-DD` of `date` in America/Sao_Paulo (no per-user time zone yet). */
export function saoPauloDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export type HandlerDeps = {
  connect: (url: string) => Sql
  createPluggy: typeof createPluggyClient
  now: () => Date
  /** Receives aggregate-only lines; the runtime decides where they go. */
  log: (line: string) => void
}

const defaultDeps: Omit<HandlerDeps, 'log'> = {
  // Transaction-mode pooler: no prepared statements; one connection is enough.
  connect: (url) => postgres(url, { prepare: false, max: 1 }),
  createPluggy: createPluggyClient,
  now: () => new Date(),
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

export async function handleSyncRequest(
  request: Request,
  rawEnv: Readonly<Record<string, string | undefined>>,
  deps: Partial<HandlerDeps> & Pick<HandlerDeps, 'log'>,
): Promise<Response> {
  const { connect, createPluggy, now, log } = { ...defaultDeps, ...deps }
  const parsed = parseSyncEnv(rawEnv)
  const expected = rawEnv[ENV_KEYS.token]?.trim() ?? ''
  // Authenticate before anything else: a caller without the token learns
  // nothing, not even whether the function is misconfigured.
  const authorized =
    expected.length >= MIN_TOKEN_LENGTH &&
    (await tokenMatches(request.headers.get(TOKEN_HEADER), expected))
  if (!authorized) {
    if (!parsed.ok) log(`pluggy-sync misconfigured: ${parsed.problems.join('; ')}`)
    return json(401, { ok: false, error: 'unauthorized' })
  }
  if (request.method !== 'POST') return json(405, { ok: false, error: 'method not allowed' })
  if (!parsed.ok) {
    log(`pluggy-sync misconfigured: ${parsed.problems.join('; ')}`)
    return json(500, { ok: false, error: 'misconfigured' })
  }
  const { env } = parsed

  const sql = connect(env.dbUrl)
  try {
    const pluggy = await createPluggy({
      clientId: env.pluggyClientId,
      clientSecret: env.pluggyClientSecret,
    })
    const summary = await runPluggySync({
      sql,
      pluggy,
      userId: env.userId,
      itemIds: env.itemIds,
      today: saoPauloDay(now()),
    })
    for (const a of summary.accounts) {
      log(
        `item #${a.item} (${a.institution}) ${a.type}/${a.subtype}: ${a.transactions} transactions (${a.pending} pending), ${a.from ?? '-'} → ${a.to ?? '-'}, removed ${a.removed}`,
      )
    }
    for (const s of summary.skipped) {
      log(`item #${s.item} (${s.institution}): skipped, status ${s.status}`)
    }
    for (const u of summary.unassigned) {
      log(`item #${u.item} (${u.institution}): unassigned, choose its space in the app`)
    }
    return json(200, { ok: true, ...summary })
  } catch (error) {
    log(`pluggy-sync failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    return json(500, { ok: false, error: 'sync failed' })
  } finally {
    await sql.end({ timeout: 5 })
  }
}
