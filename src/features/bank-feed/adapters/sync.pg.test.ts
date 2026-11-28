import { fluxiDb, personalScope, seedUser, truncateFluxiTables } from '@/db'
import { ownerDb } from '@/db/owner'
import { spaces } from '@/db/schema'
import { bankFeedAccounts, bankFeedItems, bankTransactions } from '@/db/schema-bank-feed'
import { requireEnv } from '@cbrl/env'
import { sql } from 'drizzle-orm'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PluggyItem } from '../core/pluggy'
import type { PluggyClient } from './pluggy.client'
import { handleSyncRequest, TOKEN_HEADER, tokenMatches } from './sync'

const ANA = '11111111-1111-4111-8111-111111111111'
const TOKEN = 'a'.repeat(64)
const env = {
  PLUGGY_CLIENT_ID: 'id',
  PLUGGY_CLIENT_SECRET: 'secret',
  PLUGGY_ITEM_IDS: 'item-ok, item-busy',
  FLUXI_SYNC_USER_ID: ANA,
  FLUXI_SYNC_DB_URL: requireEnv('POSTGRES_URL'),
  FLUXI_SYNC_TOKEN: TOKEN,
  FLUXI_HOLDER_KEY_SECRET: 'k'.repeat(64),
}

type FakeAccount = { id: string; name: string; taxNumber?: string; owner?: string }
type FakeItem = {
  status?: string
  /** Extra `items-retrieve` fields (health, error, dates). */
  item?: Partial<PluggyItem>
  accounts?: FakeAccount[]
  identity?: { companyName?: string | null; documentType?: string | null } | null
}

const PF = '123.456.789-09'
const PJ = '12.345.678/0001-90'

/** Per-item Pluggy fixtures; items not listed are one plain account of unknown holder. */
let fixtures: Record<string, FakeItem> = {}

const pluggy: PluggyClient = {
  getItem: (id) =>
    Promise.resolve({
      id,
      status: fixtures[id]?.status ?? (id === 'item-busy' ? 'UPDATING' : 'UPDATED'),
      connector: { name: 'MeuPluggy' },
      ...fixtures[id]?.item,
    }),
  listAccounts: (itemId) =>
    Promise.resolve(
      (fixtures[itemId]?.accounts ?? [{ id: 'acc-1', name: 'Inter Conta' }]).map((a) => ({
        id: `${itemId}-${a.id}`,
        itemId,
        type: 'BANK' as const,
        subtype: 'CHECKING_ACCOUNT',
        name: a.name,
        balance: 10,
        currencyCode: 'BRL',
        taxNumber: a.taxNumber ?? null,
        owner: a.owner ?? null,
      })),
    ),
  getIdentity: (itemId) => Promise.resolve(fixtures[itemId]?.identity ?? null),
  listTransactions: (accountId) =>
    Promise.resolve([
      {
        id: `${accountId}-t1`,
        accountId,
        description: 'Café',
        amount: 5,
        date: '2026-11-01T00:00:00.000Z',
        type: 'DEBIT',
        status: 'PENDING',
      },
      {
        id: `${accountId}-t2`,
        accountId,
        description: 'Pix',
        amount: 50,
        date: '2026-11-03',
        type: 'CREDIT',
      },
    ]),
}

/** Connects as `fluxi_sync`, like the deployed function. */
function connectAsSync(url: string) {
  return postgres(url, {
    prepare: false,
    max: 1,
    connection: { options: '-c role=fluxi_sync' },
  })
}

const call = (init: RequestInit = {}, rawEnv: Record<string, string> = env) => {
  const log = vi.fn<(line: string) => void>()
  const response = handleSyncRequest(new Request('http://fn/pluggy-sync', init), rawEnv, {
    log,
    connect: connectAsSync,
    createPluggy: () => Promise.resolve(pluggy),
    now: () => new Date('2026-11-25T12:00:00Z'),
  })
  return { response, log }
}

const authed = { method: 'POST', headers: { [TOKEN_HEADER]: TOKEN } }

describe('pluggy-sync handler (Postgres)', () => {
  const db = () => fluxiDb.db()
  beforeEach(async () => {
    await truncateFluxiTables(ownerDb.db())
    await seedUser(ownerDb.db(), { id: ANA, email: 'ana@example.test' })
    fixtures = {}
  })
  afterAll(async () => {
    await truncateFluxiTables(ownerDb.db())
  })

  it('compares tokens exactly', async () => {
    expect(await tokenMatches(TOKEN, TOKEN)).toBe(true)
    expect(await tokenMatches(`${TOKEN}x`, TOKEN)).toBe(false)
    expect(await tokenMatches(null, TOKEN)).toBe(false)
    expect(await tokenMatches('', '')).toBe(false)
  })

  it('rejects calls without the right token, whatever the config', async () => {
    expect((await call({ method: 'POST' }).response).status).toBe(401)
    expect(
      (await call({ method: 'POST', headers: { [TOKEN_HEADER]: 'b'.repeat(64) } }).response).status,
    ).toBe(401)
    const weak = call(
      { method: 'POST', headers: { [TOKEN_HEADER]: 'short' } },
      { ...env, FLUXI_SYNC_TOKEN: 'short' },
    )
    expect((await weak.response).status).toBe(401)
    expect(weak.log).toHaveBeenCalledWith(expect.stringContaining('FLUXI_SYNC_TOKEN'))
    expect((await call({ headers: { [TOKEN_HEADER]: TOKEN } }).response).status).toBe(405)
    const broken = call(authed, { ...env, FLUXI_SYNC_USER_ID: 'nope' })
    expect((await broken.response).status).toBe(500)
  })

  it('records new items as unassigned and stores nothing of them', async () => {
    const res = await call(authed).response
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      accounts: [],
      skipped: [],
      unassigned: [
        { item: 1, institution: 'Inter', company: false },
        { item: 2, institution: 'Inter', company: false },
      ],
      routed: [],
      ledger: {
        removed: 0,
        transfers: 0,
        created: 0,
        updated: 0,
        anchored: 0,
        split: 0,
        categorized: 0,
        named: 0,
      },
    })
    const items = await db().select().from(bankFeedItems)
    expect(items.map((i) => [i.itemId, i.spaceId, i.label]).sort()).toEqual([
      ['item-busy', null, 'Inter'],
      ['item-ok', null, 'Inter'],
    ])
    expect(await db().select().from(bankFeedAccounts)).toHaveLength(0)
    expect(await db().select().from(bankTransactions)).toHaveLength(0)
  })

  it('syncs ready items as fluxi_sync, skips the rest and logs aggregates only', async () => {
    const { spaceId } = await personalScope(db(), ANA)
    await db()
      .insert(bankFeedItems)
      .values([
        { userId: ANA, itemId: 'item-ok', spaceId, spaceSource: 'manual' },
        { userId: ANA, itemId: 'item-busy', spaceId, spaceSource: 'manual' },
      ])
    const { response, log } = call(authed)
    const res = await response
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      accounts: [
        {
          item: 1,
          institution: 'Inter',
          type: 'BANK',
          subtype: 'CHECKING_ACCOUNT',
          transactions: 2,
          pending: 1,
          removed: 0,
          from: '2026-11-01',
          to: '2026-11-03',
        },
      ],
      skipped: [{ item: 2, institution: 'Inter', status: 'UPDATING' }],
      unassigned: [],
      routed: [],
      // The feed account with movement is auto-linked (a new "Inter" account)
      // and its transactions materialized, all as fluxi_sync.
      ledger: {
        removed: 0,
        transfers: 0,
        created: 2,
        updated: 0,
        anchored: 1,
        split: 0,
        categorized: 0,
        named: 0,
      },
    })
    const rows = await db().select().from(bankTransactions)
    expect(rows.every((r) => r.spaceId === spaceId)).toBe(true)
    expect(rows.map((r) => [r.externalId, r.amountCents]).sort()).toEqual([
      ['item-ok-acc-1-t1', -500],
      ['item-ok-acc-1-t2', 5000],
    ])
    const logged = log.mock.calls.map(([line]) => line).join('\n')
    expect(logged).not.toMatch(/Café|Pix|secret|a{64}/)
  })

  it('records the health of every item, skipped and unassigned ones included, for the sync user only', async () => {
    const BIA = '22222222-2222-4222-8222-222222222222'
    await seedUser(ownerDb.db(), { id: BIA, email: 'bia@example.test' })
    await db().insert(bankFeedItems).values({ userId: BIA, itemId: 'item-busy', label: 'Bia' })
    const { spaceId } = await personalScope(db(), ANA)
    await db()
      .insert(bankFeedItems)
      .values({ userId: ANA, itemId: 'item-busy', spaceId, spaceSource: 'manual' })
    fixtures = {
      'item-ok': {
        status: 'LOGIN_ERROR',
        item: {
          executionStatus: 'INVALID_CREDENTIALS',
          error: { code: 'INVALID_CREDENTIALS' },
          lastUpdatedAt: '2026-11-20T09:02:00.000Z',
          consentExpiresAt: '2027-05-01T00:00:00.000Z',
          connector: { name: 'MeuPluggy', health: { status: 'UNSTABLE' } },
        },
      },
      'item-busy': {
        status: 'UPDATING',
        item: { nextAutoSyncAt: '2026-11-26T09:00:00.000Z' },
      },
    }
    const res = await call(authed).response
    expect(res.status).toBe(200)
    const rows = await db().select().from(bankFeedItems)
    const of = (userId: string, itemId: string) =>
      rows.find((r) => r.userId === userId && r.itemId === itemId)
    // Unassigned: nothing synced, but its health is on record.
    expect(of(ANA, 'item-ok')).toMatchObject({
      spaceId: null,
      itemStatus: 'LOGIN_ERROR',
      executionStatus: 'INVALID_CREDENTIALS',
      errorCode: 'INVALID_CREDENTIALS',
      lastUpdatedAt: new Date('2026-11-20T09:02:00.000Z'),
      consentExpiresAt: new Date('2027-05-01T00:00:00.000Z'),
      institutionHealth: 'UNSTABLE',
    })
    expect(of(ANA, 'item-ok')?.checkedAt).toBeInstanceOf(Date)
    // Skipped (not UPDATED yet): recorded before skipping.
    expect(of(ANA, 'item-busy')).toMatchObject({
      spaceId,
      itemStatus: 'UPDATING',
      errorCode: null,
      nextSyncAt: new Date('2026-11-26T09:00:00.000Z'),
    })
    expect(of(ANA, 'item-busy')?.checkedAt).toBeInstanceOf(Date)
    // Another user's row with the same item id is never touched.
    expect(of(BIA, 'item-busy')).toMatchObject({ itemStatus: null, checkedAt: null, label: 'Bia' })
  })

  it('routes a connection held only by persons to the personal space (auto)', async () => {
    fixtures = { 'item-ok': { accounts: [{ id: 'a', name: 'Nubank', taxNumber: PF }] } }
    const { spaceId } = await personalScope(db(), ANA)
    const res = await call(authed, { ...env, PLUGGY_ITEM_IDS: 'item-ok' }).response
    expect(await res.json()).toMatchObject({
      routed: [{ item: 1, institution: 'Nubank', holder: 'person' }],
      unassigned: [],
    })
    const [item] = await db().select().from(bankFeedItems)
    expect(item).toMatchObject({ spaceId, spaceSource: 'auto', suggestedSpaceName: null })
    const [feed] = await db().select().from(bankFeedAccounts)
    expect(feed).toMatchObject({ spaceId, holderType: 'person', holderKey: null })
  })

  it('leaves an unknown company unassigned with a suggested space name', async () => {
    fixtures = {
      'item-a': {
        accounts: [{ id: 'a', name: 'Nubank', taxNumber: PJ, owner: 'Dona Ltda' }],
        identity: { companyName: '  ACME Comércio Ltda ', documentType: 'CNPJ' },
      },
      'item-b': { accounts: [{ id: 'a', name: 'Nubank', taxNumber: PJ, owner: 'Dona Ltda' }] },
      'item-c': { accounts: [{ id: 'a', name: 'Inter Conta', taxNumber: '12345678000190' }] },
    }
    const { response, log } = call(authed, { ...env, PLUGGY_ITEM_IDS: 'item-a,item-b,item-c' })
    expect(await (await response).json()).toMatchObject({
      routed: [],
      unassigned: [
        { item: 1, institution: 'Nubank Empresas', company: true },
        { item: 2, institution: 'Nubank Empresas', company: true },
        { item: 3, institution: 'Inter Empresas', company: true },
      ],
    })
    const items = await db().select().from(bankFeedItems)
    expect(
      items.map((i) => [i.itemId, i.spaceId, i.spaceSource, i.suggestedSpaceName]).sort(),
    ).toEqual([
      ['item-a', null, null, 'ACME Comércio Ltda'],
      ['item-b', null, null, 'Dona Ltda'],
      ['item-c', null, null, 'Inter Empresas'],
    ])
    expect(await db().select().from(bankFeedAccounts)).toHaveLength(0)
    expect(log.mock.calls.join('\n')).not.toMatch(/12\.?345|ACME|Dona/)
  })

  it('routes a company to the space already holding the same company (auto)', async () => {
    const [work] = await db()
      .insert(spaces)
      .values({ userId: ANA, name: 'Loja', kind: 'business' })
      .returning()
    fixtures = {
      'item-1': { accounts: [{ id: 'a', name: 'Nubank', taxNumber: PJ }] },
      'item-2': { accounts: [{ id: 'a', name: 'Inter Conta', taxNumber: '12345678000190' }] },
      'item-3': { accounts: [{ id: 'a', name: 'Itaú', taxNumber: '98.765.432/0001-10' }] },
    }
    await db()
      .insert(bankFeedItems)
      .values({ userId: ANA, itemId: 'item-1', spaceId: work!.id, spaceSource: 'manual' })
    await (await call(authed, { ...env, PLUGGY_ITEM_IDS: 'item-1' }).response).json()
    const [stored] = await db().select().from(bankFeedAccounts)
    expect(stored?.holderType).toBe('company')
    expect(stored?.holderKey).toMatch(/^[0-9a-f]{64}$/)
    // The document itself is nowhere in the row.
    expect(JSON.stringify(stored)).not.toMatch(/12345678|0001/)

    const res = await call(authed, { ...env, PLUGGY_ITEM_IDS: 'item-2,item-3' }).response
    expect(await res.json()).toMatchObject({
      routed: [{ item: 1, institution: 'Inter Empresas', holder: 'company' }],
      unassigned: [{ item: 2, institution: 'Itaú Empresas', company: true }],
    })
    const items = await db().select().from(bankFeedItems)
    expect(items.find((i) => i.itemId === 'item-2')).toMatchObject({
      spaceId: work!.id,
      spaceSource: 'auto',
    })
  })

  it('never overrides a manual choice, pausing included', async () => {
    fixtures = {
      'item-1': { accounts: [{ id: 'a', name: 'Nubank', taxNumber: PF }] },
      'item-2': { accounts: [{ id: 'a', name: 'Nubank', taxNumber: PJ }] },
    }
    await db()
      .insert(bankFeedItems)
      .values([
        { userId: ANA, itemId: 'item-1', spaceSource: 'manual' },
        { userId: ANA, itemId: 'item-2', spaceSource: 'manual' },
      ])
    const res = await call(authed, { ...env, PLUGGY_ITEM_IDS: 'item-1,item-2' }).response
    expect(await res.json()).toMatchObject({ routed: [], accounts: [] })
    const items = await db().select().from(bankFeedItems)
    expect(items.every((i) => i.spaceId === null && i.suggestedSpaceName === null)).toBe(true)
  })

  it('stores no holder key (and warns) without the secret', async () => {
    fixtures = { 'item-1': { accounts: [{ id: 'a', name: 'Nubank', taxNumber: PJ }] } }
    const personal = await personalScope(db(), ANA)
    await db()
      .insert(bankFeedItems)
      .values({ userId: ANA, itemId: 'item-1', spaceId: personal.spaceId, spaceSource: 'manual' })
    const { FLUXI_HOLDER_KEY_SECRET: _secret, ...rest } = env
    const { response, log } = call(authed, { ...rest, PLUGGY_ITEM_IDS: 'item-1' })
    expect((await response).status).toBe(200)
    const [stored] = await db().select().from(bankFeedAccounts)
    expect(stored).toMatchObject({ holderType: 'company', holderKey: null })
    expect(log).toHaveBeenCalledWith(expect.stringContaining('FLUXI_HOLDER_KEY_SECRET missing'))
  })

  it('gives fluxi_sync the routing function and still no access to spaces', async () => {
    const { rows } = await db().execute<{ route: boolean; spaces: boolean; banks: boolean }>(sql`
      select
        has_function_privilege('fluxi_sync',
          'private.route_bank_feed_item(uuid, text, text[], text[], text)', 'EXECUTE') as route,
        has_table_privilege('fluxi_sync', 'public.spaces', 'SELECT') as spaces,
        has_table_privilege('fluxi_sync', 'public.banks', 'SELECT') as banks`)
    expect(rows[0]).toEqual({ route: true, spaces: false, banks: false })
    const { rows: anon } = await db().execute<{ ok: boolean }>(sql`
      select has_function_privilege('authenticated',
        'private.route_bank_feed_item(uuid, text, text[], text[], text)', 'EXECUTE') as ok`)
    expect(anon[0]?.ok).toBe(false)
  })

  it('answers 500 without details when the sync fails', async () => {
    const log = vi.fn<(line: string) => void>()
    const res = await handleSyncRequest(new Request('http://fn', authed), env, {
      log,
      connect: connectAsSync,
      createPluggy: () => Promise.reject(new Error('pluggy POST /auth → 401')),
    })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ ok: false, error: 'sync failed' })
  })
})
