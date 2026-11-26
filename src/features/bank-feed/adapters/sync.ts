import postgres, { type Sql } from 'postgres'
import { connectionInstitution } from '../core/institution.ts'
import {
  companyDocumentOf,
  coveredFrom,
  holderKeyOf,
  holderTypeOf,
  itemReadiness,
  PLUGGY_SOURCE,
  spaceNameOf,
  toFeedAccount,
  toFeedTransaction,
  type HolderType,
  type ItemReadiness,
  type PluggyAccount,
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
  /** Key of the companies' `holder_key` HMAC; null = keys are not stored (warned). */
  holderKeySecret: string | null
}

const ENV_KEYS = {
  pluggyClientId: 'PLUGGY_CLIENT_ID',
  pluggyClientSecret: 'PLUGGY_CLIENT_SECRET',
  itemIds: 'PLUGGY_ITEM_IDS',
  userId: 'FLUXI_SYNC_USER_ID',
  dbUrl: 'FLUXI_SYNC_DB_URL',
  token: 'FLUXI_SYNC_TOKEN',
  holderKeySecret: 'FLUXI_HOLDER_KEY_SECRET',
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
    holderKeySecret: read(ENV_KEYS.holderKeySecret) || null,
  }
  const problems = [
    !env.pluggyClientId && `missing ${ENV_KEYS.pluggyClientId}`,
    !env.pluggyClientSecret && `missing ${ENV_KEYS.pluggyClientSecret}`,
    itemIds.length === 0 && `missing ${ENV_KEYS.itemIds}`,
    !UUID.test(env.userId) && `${ENV_KEYS.userId} must be a uuid`,
    !env.dbUrl && `missing ${ENV_KEYS.dbUrl}`,
    env.token.length < MIN_TOKEN_LENGTH &&
      `${ENV_KEYS.token} must have at least ${MIN_TOKEN_LENGTH} characters`,
    env.holderKeySecret !== null &&
      env.holderKeySecret.length < MIN_TOKEN_LENGTH &&
      `${ENV_KEYS.holderKeySecret} must have at least ${MIN_TOKEN_LENGTH} characters`,
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

/** A configured item no space was chosen for yet ("Conexões" in the settings): not synced. */
export type UnassignedItem = {
  item: number
  institution: string
  /** A company holds it: the app offers to create a space for it. */
  company: boolean
}

/** Items the sync routed to a space on its own this run (`space_source = 'auto'`). */
export type RoutedItem = { item: number; institution: string; holder: 'person' | 'company' }

/** What `private.materialize_bank_feed` did, summed over the synced spaces. */
export type LedgerSummary = {
  removed: number
  transfers: number
  created: number
  updated: number
  anchored: number
  /** Bank transfers split back into singles (their pair lost the transfer signal). */
  split: number
  /** Bank entries a categorization rule classified. */
  categorized: number
  /** Bank entries named after the merchant (their bank description was generic). */
  named: number
}

export type SyncSummary = {
  accounts: AccountSummary[]
  skipped: SkippedItem[]
  unassigned: UnassignedItem[]
  routed: RoutedItem[]
  ledger: LedgerSummary
}

const LEDGER_KEYS = [
  'removed',
  'transfers',
  'created',
  'updated',
  'anchored',
  'split',
  'categorized',
  'named',
] as const

const EMPTY_LEDGER: LedgerSummary = {
  removed: 0,
  transfers: 0,
  created: 0,
  updated: 0,
  anchored: 0,
  split: 0,
  categorized: 0,
  named: 0,
}

/**
 * Materialize `spaceId`'s mapped feed into its ledger and anchor the mapped
 * accounts' balances (`private.materialize_bank_feed`, the only ledger write
 * `fluxi_sync` can do).
 */
export async function materializeSpace(
  sql: Sql,
  { userId, spaceId }: { userId: string; spaceId: string },
  today: string,
): Promise<LedgerSummary> {
  const [row] = await sql<{ result: LedgerSummary }[]>`
    select private.materialize_bank_feed(${userId}::uuid, ${spaceId}::uuid, ${today}::date) as result`
  return row?.result ?? EMPTY_LEDGER
}

export type SyncRun = {
  sql: Sql
  pluggy: PluggyClient
  userId: string
  itemIds: readonly string[]
  /** `YYYY-MM-DD` in America/Sao_Paulo. */
  today: string
  /** `FLUXI_HOLDER_KEY_SECRET`; null = companies get no `holder_key`. */
  holderKeySecret?: string | null
}

/** What the sync keeps of an item's holders: kinds and companies' keys, never documents. */
export type ItemHolders = {
  types: (HolderType | null)[]
  /** `holder_key` by Pluggy account id (companies, with the secret only). */
  keys: Map<string, string>
}

/** Holder kinds and keys of an item's accounts; the documents are dropped right here. */
export async function holdersOf(
  accounts: readonly PluggyAccount[],
  secret: string | null,
): Promise<ItemHolders> {
  const keys = new Map<string, string>()
  for (const account of accounts) {
    const cnpj = companyDocumentOf(account.taxNumber)
    if (cnpj !== null && secret !== null) keys.set(account.id, await holderKeyOf(cnpj, secret))
  }
  return { types: accounts.map((a) => holderTypeOf(a.taxNumber)), keys }
}

/**
 * The name offered for a new space for a company's connection: Pluggy's
 * identity `companyName` (often the legal name; Pluggy has no trade name for
 * the holder), else the `owner` of one of its company accounts, else the
 * institution ("Nubank Empresas").
 */
export async function suggestedSpaceName(
  pluggy: PluggyClient,
  itemId: string,
  accounts: readonly PluggyAccount[],
  institution: string,
): Promise<string> {
  const identity = await pluggy.getIdentity(itemId)
  const owner = accounts.find((a) => holderTypeOf(a.taxNumber) === 'company')?.owner
  return spaceNameOf(identity?.companyName) ?? spaceNameOf(owner) ?? institution
}

/**
 * Record `itemId` (label = institution) and return its space and who chose
 * it (null source = nobody yet).
 */
async function recordItem(
  sql: Sql,
  userId: string,
  itemId: string,
  label: string,
): Promise<{ spaceId: string | null; source: string | null }> {
  const [row] = await sql<{ space_id: string | null; space_source: string | null }[]>`
    insert into bank_feed_items (user_id, item_id, label)
    values (${userId}, ${itemId}, ${label})
    on conflict (user_id, item_id) do update set
      label = excluded.label,
      updated_at = now()
    returning space_id, space_source`
  return { spaceId: row?.space_id ?? null, source: row?.space_source ?? null }
}

/** `private.route_bank_feed_item`: the space chosen for an undecided item, or null. */
async function routeItem(
  sql: Sql,
  { userId, itemId }: { userId: string; itemId: string },
  holders: ItemHolders,
  suggested: string | null,
): Promise<string | null> {
  const [row] = await sql<{ space_id: string | null }[]>`
    select private.route_bank_feed_item(${userId}::uuid, ${itemId}, ${holders.types}::text[],
      ${[...holders.keys.values()]}::text[], ${suggested}) as space_id`
  return row?.space_id ?? null
}

/** An item as the sync sees it once recorded (and routed, when nobody had decided). */
type ResolvedItem = {
  connector: string
  institution: string
  readiness: ItemReadiness
  accounts: PluggyAccount[]
  holders: ItemHolders
  company: boolean
  spaceId: string | null
  /** The sync chose the space just now. */
  routed: boolean
}

/**
 * Read the item's accounts (holder kinds and keys only), record it and, while
 * nobody chose its space, let the database route it from the holders.
 */
async function resolveItem(
  { sql, pluggy, userId, holderKeySecret = null }: SyncRun,
  itemId: string,
): Promise<ResolvedItem> {
  const item = await pluggy.getItem(itemId)
  const connector = item.connector?.name ?? 'Pluggy'
  const accounts = await pluggy.listAccounts(itemId)
  const holders = await holdersOf(accounts, holderKeySecret)
  const company = holders.types.includes('company')
  const names = accounts.map((a) => a.marketingName?.trim() || a.name)
  const institution = connectionInstitution(names, connector, holders.types) ?? connector
  const recorded = await recordItem(sql, userId, itemId, institution)
  const base = {
    connector,
    institution,
    readiness: itemReadiness(item),
    accounts,
    holders,
    company,
  }
  if (recorded.source !== null) return { ...base, spaceId: recorded.spaceId, routed: false }
  const suggested = company ? await suggestedSpaceName(pluggy, itemId, accounts, institution) : null
  const spaceId = await routeItem(sql, { userId, itemId }, holders, suggested)
  return { ...base, spaceId, routed: spaceId !== null }
}

/** Store one item's accounts and transactions in its space; returns their summaries. */
async function syncItemAccounts(
  { sql, pluggy, userId, today }: SyncRun,
  resolved: ResolvedItem & { spaceId: string },
  item: number,
): Promise<AccountSummary[]> {
  const out: AccountSummary[] = []
  for (const account of resolved.accounts) {
    const key = resolved.holders.keys.get(account.id) ?? null
    const feed = toFeedAccount(account, resolved.connector, key)
    const rows = (await pluggy.listTransactions(account.id)).map(toFeedTransaction)
    const dates = rows.map((r) => r.date).sort()
    const counts = await syncFeedAccount(
      sql,
      { userId, spaceId: resolved.spaceId },
      { source: PLUGGY_SOURCE, account: feed, transactions: rows, coveredFrom: coveredFrom(today) },
    )
    out.push({
      item,
      institution: resolved.institution,
      type: feed.type,
      subtype: feed.subtype,
      transactions: rows.length,
      pending: rows.filter((r) => r.status === 'PENDING').length,
      removed: counts.removed,
      from: dates[0] ?? null,
      to: dates.at(-1) ?? null,
    })
  }
  return out
}

/**
 * Item by item, account by account: only one account's transactions are in
 * memory at a time. Items that are not UPDATED yet, or not routed to a space,
 * are reported and skipped.
 */
export async function runPluggySync(run: SyncRun): Promise<SyncSummary> {
  const { sql, userId, itemIds, today } = run
  const summary: SyncSummary = {
    accounts: [],
    skipped: [],
    unassigned: [],
    routed: [],
    ledger: { ...EMPTY_LEDGER },
  }
  const synced = new Set<string>()
  for (const [index, itemId] of itemIds.entries()) {
    const item = index + 1
    const resolved = await resolveItem(run, itemId)
    const { institution, company, spaceId, readiness } = resolved
    if (resolved.routed) {
      summary.routed.push({ item, institution, holder: company ? 'company' : 'person' })
    }
    if (spaceId === null) {
      summary.unassigned.push({ item, institution, company })
      continue
    }
    if (!readiness.ready) {
      summary.skipped.push({ item, institution, status: readiness.reason })
      continue
    }
    synced.add(spaceId)
    summary.accounts.push(...(await syncItemAccounts(run, { ...resolved, spaceId }, item)))
  }
  for (const spaceId of synced) {
    const done = await materializeSpace(sql, { userId, spaceId }, today)
    for (const key of LEDGER_KEYS) {
      summary.ledger[key] += done[key]
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

/** Aggregate-only lines of a sync run. */
function logSummary(summary: SyncSummary, log: (line: string) => void): void {
  for (const a of summary.accounts) {
    log(
      `item #${a.item} (${a.institution}) ${a.type}/${a.subtype}: ${a.transactions} transactions (${a.pending} pending), ${a.from ?? '-'} → ${a.to ?? '-'}, removed ${a.removed}`,
    )
  }
  for (const s of summary.skipped) {
    log(`item #${s.item} (${s.institution}): skipped, status ${s.status}`)
  }
  const l = summary.ledger
  log(
    `ledger: ${l.created} created, ${l.transfers} transfers, ${l.updated} updated, ${l.removed} removed, ${l.split} transfers split, ${l.categorized} categorized by rules, ${l.named} named after the merchant, ${l.anchored} balances anchored`,
  )
  for (const r of summary.routed) {
    log(`item #${r.item} (${r.institution}): routed automatically (${r.holder} holder)`)
  }
  for (const u of summary.unassigned) {
    const hint = u.company ? ' (company, space suggested)' : ''
    log(`item #${u.item} (${u.institution}): unassigned${hint}, choose its space in the app`)
  }
}

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
      holderKeySecret: env.holderKeySecret,
    })
    if (env.holderKeySecret === null) {
      log(`pluggy-sync: ${ENV_KEYS.holderKeySecret} missing, company connections get no holder key`)
    }
    logSummary(summary, log)
    return json(200, { ok: true, ...summary })
  } catch (error) {
    log(`pluggy-sync failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    return json(500, { ok: false, error: 'sync failed' })
  } finally {
    await sql.end({ timeout: 5 })
  }
}
