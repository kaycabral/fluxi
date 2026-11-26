import { fluxiDb, personalScope, seedUser, truncateFluxiTables } from '@/db'
import { bankFeedAccounts, bankFeedItems, bankTransactions } from '@/db/schema-bank-feed'
import { requireEnv } from '@cbrl/env'
import postgres from 'postgres'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
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
}

const pluggy: PluggyClient = {
  getItem: (id) =>
    Promise.resolve({
      id,
      status: id === 'item-ok' ? 'UPDATED' : 'UPDATING',
      connector: { name: 'Banco X' },
    }),
  listAccounts: (itemId) =>
    Promise.resolve([
      {
        id: 'acc-1',
        itemId,
        type: 'BANK',
        subtype: 'CHECKING_ACCOUNT',
        name: 'Conta',
        balance: 10,
        currencyCode: 'BRL',
      },
    ]),
  listTransactions: (accountId) =>
    Promise.resolve([
      {
        id: 't1',
        accountId,
        description: 'Café',
        amount: 5,
        date: '2026-11-01T00:00:00.000Z',
        type: 'DEBIT',
        status: 'PENDING',
      },
      { id: 't2', accountId, description: 'Pix', amount: 50, date: '2026-11-03', type: 'CREDIT' },
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
    await truncateFluxiTables(db())
    await seedUser(db(), { id: ANA, email: 'ana@example.test' })
  })
  afterAll(async () => {
    await truncateFluxiTables(db())
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
        { item: 1, institution: 'Banco X' },
        { item: 2, institution: 'Banco X' },
      ],
      ledger: {
        removed: 0,
        transfers: 0,
        created: 0,
        updated: 0,
        anchored: 0,
        split: 0,
        categorized: 0,
      },
    })
    const items = await db().select().from(bankFeedItems)
    expect(items.map((i) => [i.itemId, i.spaceId, i.label]).sort()).toEqual([
      ['item-busy', null, 'Banco X'],
      ['item-ok', null, 'Banco X'],
    ])
    expect(await db().select().from(bankFeedAccounts)).toHaveLength(0)
    expect(await db().select().from(bankTransactions)).toHaveLength(0)
  })

  it('syncs ready items as fluxi_sync, skips the rest and logs aggregates only', async () => {
    const { spaceId } = await personalScope(db(), ANA)
    await db()
      .insert(bankFeedItems)
      .values([
        { userId: ANA, itemId: 'item-ok', spaceId },
        { userId: ANA, itemId: 'item-busy', spaceId },
      ])
    const { response, log } = call(authed)
    const res = await response
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      ok: true,
      accounts: [
        {
          item: 1,
          institution: 'Banco X',
          type: 'BANK',
          subtype: 'CHECKING_ACCOUNT',
          transactions: 2,
          pending: 1,
          removed: 0,
          from: '2026-11-01',
          to: '2026-11-03',
        },
      ],
      skipped: [{ item: 2, institution: 'Banco X', status: 'UPDATING' }],
      unassigned: [],
      // The feed account with movement is auto-linked (a new "Banco X" account)
      // and its transactions materialized, all as fluxi_sync.
      ledger: {
        removed: 0,
        transfers: 0,
        created: 2,
        updated: 0,
        anchored: 1,
        split: 0,
        categorized: 0,
      },
    })
    const rows = await db().select().from(bankTransactions)
    expect(rows.every((r) => r.spaceId === spaceId)).toBe(true)
    expect(rows.map((r) => [r.externalId, r.amountCents]).sort()).toEqual([
      ['t1', -500],
      ['t2', 5000],
    ])
    const logged = log.mock.calls.map(([line]) => line).join('\n')
    expect(logged).not.toMatch(/Café|Pix|secret|a{64}/)
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
