import { fluxiDb, personalScope, seedUser, truncateFluxiTables } from '@/db'
import { accounts, banks, entries, spaces } from '@/db/schema'
import { bankFeedAccounts } from '@/db/schema-bank-feed'
import {
  feedAccountShortLabel,
  INSTITUTION_SAMPLES,
  institutionOf,
} from '@/features/bank-feed/core/institution'
import type { FeedAccountRow, FeedTransactionRow } from '@/features/bank-feed/core/pluggy'
import type { Scope } from '@/features/spaces/core/space'
import { requireEnv } from '@cbrl/env'
import { and, eq, sql } from 'drizzle-orm'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { syncFeedAccount } from './feed.write'
import { materializeSpace } from './sync'

const ANA = '11111111-1111-4111-8111-111111111111'
const BIA = '22222222-2222-4222-8222-222222222222'
const TODAY = '2026-11-25'

const db = () => fluxiDb.db()
/** Exactly like the Edge Function: postgres.js as the `fluxi_sync` role. */
const asSync = postgres(requireEnv('POSTGRES_URL'), { prepare: false, max: 1 })

let ana: Scope
let bia: Scope
let work: Scope

const feedAcc = (over: Partial<FeedAccountRow>): FeedAccountRow => ({
  externalId: 'acc',
  itemId: 'item-itau',
  institution: 'MeuPluggy',
  name: 'itau',
  type: 'BANK',
  subtype: 'CHECKING_ACCOUNT',
  balanceCents: 0,
  numberHint: null,
  cardStatus: null,
  holderType: null,
  holderKey: null,
  ...over,
})

const tx = (externalId: string, amountCents = -5000): FeedTransactionRow => ({
  externalId,
  date: '2026-11-10',
  amountCents,
  description: `Banco ${externalId}`,
  status: 'POSTED',
  category: null,
  operationType: null,
  installmentNumber: null,
  totalInstallments: null,
  billMonth: null,
  merchantName: null,
  merchantCategory: null,
})

const feed = (scope: Scope, acc: FeedAccountRow, rows: FeedTransactionRow[] = []) =>
  syncFeedAccount(asSync, scope, {
    source: 'pluggy',
    account: acc,
    transactions: rows,
    coveredFrom: '2026-01-01',
  })

const materialize = (scope: Scope = ana) => materializeSpace(asSync, scope, TODAY)

async function account(scope: Scope, bankName: string, name: string, type: 'checking' | 'credit') {
  const [bank] = await db()
    .insert(banks)
    .values({ ...scope, name: bankName })
    .returning()
  const [row] = await db()
    .insert(accounts)
    .values({ ...scope, bankId: bank!.id, name, type })
    .returning()
  return row!
}

const feedOf = async (scope: Scope, externalId: string) => {
  const [row] = await db()
    .select()
    .from(bankFeedAccounts)
    .where(
      and(eq(bankFeedAccounts.spaceId, scope.spaceId), eq(bankFeedAccounts.externalId, externalId)),
    )
  return row!
}

const accountsOf = (scope: Scope) =>
  db()
    .select({ id: accounts.id, name: accounts.name, type: accounts.type, bank: banks.name })
    .from(accounts)
    .innerJoin(banks, eq(banks.id, accounts.bankId))
    .where(eq(accounts.spaceId, scope.spaceId))
    .orderBy(banks.name, accounts.name)

beforeAll(async () => {
  await asSync`set role fluxi_sync`
})

beforeEach(async () => {
  await truncateFluxiTables(db())
  await seedUser(db(), { id: ANA, email: 'ana@example.test' })
  await seedUser(db(), { id: BIA, email: 'bia@example.test' })
  ana = await personalScope(db(), ANA)
  bia = await personalScope(db(), BIA)
  const [space] = await db()
    .insert(spaces)
    .values({ userId: ANA, name: 'Empresa', kind: 'business' })
    .returning()
  work = { userId: ANA, spaceId: space!.id }
})

afterAll(async () => {
  await truncateFluxiTables(db())
  await asSync.end()
})

describe('institution rules (SQL = TS)', () => {
  it('derives the same institution and account names in both', async () => {
    for (const sample of INSTITUTION_SAMPLES) {
      const holders = sample.holders ?? []
      const institution = institutionOf(sample.names, holders)
      const names = `{${sample.names.map((n) => JSON.stringify(n)).join(',')}}`
      const types = `{${holders.map((h) => (h === null ? 'NULL' : h)).join(',')}}`
      const { rows } = await db().execute<{ institution: string; label: string }>(sql`
        select private.feed_holder_institution(${names}::text[], ${types}::text[]) as institution,
          private.feed_account_short_label(${institution}, ${sample.feed.name},
            ${sample.feed.type}, ${sample.feed.subtype}) as label`)
      expect(rows[0]).toEqual({
        institution,
        label: feedAccountShortLabel(institution, sample.feed),
      })
    }
  })
})

describe('auto-link (Postgres)', () => {
  it('links to the only matching account of the institution, by type', async () => {
    const checking = await account(ana, 'Itaú', 'Account', 'checking')
    const [bank] = await db().select().from(banks).where(eq(banks.id, checking.bankId))
    const [card] = await db()
      .insert(accounts)
      .values({ ...ana, bankId: bank!.id, name: 'Final 9148', type: 'credit' })
      .returning()
    // Same names elsewhere: another space of Ana and another user.
    await account(work, 'Itaú', 'Account', 'checking')
    await account(bia, 'itau', 'Account', 'checking')

    await feed(ana, feedAcc({ externalId: 'chk', name: 'itau' }), [tx('t1'), tx('t2', 9000)])
    await feed(
      ana,
      feedAcc({
        externalId: 'card',
        name: 'Itaú Click Múltiplo MC Plat',
        type: 'CREDIT',
        subtype: 'CREDIT_CARD',
        balanceCents: 30000,
      }),
    )
    expect(await materialize()).toMatchObject({ linked: 2, created: 2 })
    expect(await feedOf(ana, 'chk')).toMatchObject({
      accountId: checking.id,
      mappingSource: 'auto',
    })
    // A card with only a balance (no transaction yet) has movement too.
    expect(await feedOf(ana, 'card')).toMatchObject({ accountId: card!.id, mappingSource: 'auto' })
    expect(await accountsOf(ana)).toHaveLength(2)
    const ledger = await db().select().from(entries).where(eq(entries.spaceId, ana.spaceId))
    expect(ledger.every((e) => e.accountId === checking.id)).toBe(true)

    // Idempotent: nothing more to link, nothing created.
    expect(await materialize()).toMatchObject({ linked: 0, created: 0 })
    expect(await accountsOf(ana)).toHaveLength(2)
  })

  it('creates bank and account when none or several match; skips accounts without movement', async () => {
    await feed(work, feedAcc({ externalId: 'emp', itemId: 'item-btg', name: 'BTG Empresas' }), [
      tx('t1'),
    ])
    await feed(work, feedAcc({ externalId: 'emp2', itemId: 'item-btg', name: 'BTG Empresas' }))
    await feed(work, feedAcc({ externalId: 'inv', itemId: 'item-btg', name: 'BTG Investimentos' }))
    // The personal space's "BTG Empresas" account is not a candidate in Empresa.
    await account(ana, 'BTG Empresas', 'Account', 'checking')

    expect(await materialize(work)).toMatchObject({ linked: 1, created: 1 })
    expect(await accountsOf(work)).toEqual([
      expect.objectContaining({ bank: 'BTG Empresas', name: 'Conta corrente', type: 'checking' }),
    ])
    expect(await feedOf(work, 'emp2')).toMatchObject({ accountId: null, mappingSource: null })
    expect(await feedOf(work, 'inv')).toMatchObject({ accountId: null, mappingSource: null })

    // Ambiguous: two checking accounts in bank "BTG" → a new one in that bank.
    await account(ana, 'BTG', 'A', 'checking')
    const [btg] = await db()
      .select()
      .from(banks)
      .where(and(eq(banks.spaceId, ana.spaceId), eq(banks.name, 'BTG')))
    await db()
      .insert(accounts)
      .values({ ...ana, bankId: btg!.id, name: 'B', type: 'checking' })
    await feed(ana, feedAcc({ externalId: 'bank', itemId: 'item-p', name: 'BTG Banking' }), [
      tx('p1'),
    ])
    expect(await materialize()).toMatchObject({ linked: 1 })
    const linked = await feedOf(ana, 'bank')
    const [created] = await db().select().from(accounts).where(eq(accounts.id, linked.accountId!))
    expect(created).toMatchObject({ bankId: btg!.id, name: 'Conta corrente', type: 'checking' })
    expect(await db().select().from(banks).where(eq(banks.spaceId, ana.spaceId))).toHaveLength(2)
  })

  it('never touches a manual choice, an archived or an already mapped account', async () => {
    const taken = await account(ana, 'Nubank', 'Conta', 'checking')
    await db().update(accounts).set({ archivedAt: new Date() }).where(eq(accounts.id, taken.id))
    await feed(
      ana,
      feedAcc({
        externalId: 'nu',
        itemId: 'item-nu',
        name: 'Nu Pagamentos S.A. - Instituição de Pagamento (Conta Pré-paga)',
        balanceCents: 1000,
      }),
    )
    await feed(ana, feedAcc({ externalId: 'kept', itemId: 'item-x', name: 'itau' }), [tx('k1')])
    await db()
      .update(bankFeedAccounts)
      .set({ mappingSource: 'manual' })
      .where(eq(bankFeedAccounts.externalId, 'kept'))

    expect(await materialize()).toMatchObject({ linked: 1, created: 0 })
    expect(await feedOf(ana, 'kept')).toMatchObject({ accountId: null, mappingSource: 'manual' })
    const nu = await feedOf(ana, 'nu')
    expect(nu.accountId).not.toBe(taken.id)
    expect(await accountsOf(ana)).toEqual(
      expect.arrayContaining([expect.objectContaining({ bank: 'Nubank', name: 'Conta' })]),
    )
    // The active "Nubank" bank is reused; only the archived account is skipped.
    expect(
      (await db().select().from(banks).where(eq(banks.spaceId, ana.spaceId))).map((b) => b.name),
    ).toEqual(['Nubank'])
  })

  it('leaves fluxi_sync without any privilege on banks, accounts or the inner functions', async () => {
    await expect(
      asSync`insert into accounts (user_id, space_id, bank_id, name, type)
        values (${ANA}, ${ana.spaceId}, ${ana.spaceId}, 'x', 'checking')`,
    ).rejects.toThrow(/permission denied/)
    await expect(asSync`select * from banks`).rejects.toThrow(/permission denied/)
    await expect(
      asSync`select private.auto_link_bank_feed(${ANA}::uuid, ${ana.spaceId}::uuid)`,
    ).rejects.toThrow(/permission denied/)
    await expect(
      asSync`select private.materialize_bank_feed_entries(${ANA}::uuid, ${ana.spaceId}::uuid, ${TODAY}::date)`,
    ).rejects.toThrow(/permission denied/)
    await expect(
      asSync`select private.materialize_bank_feed(${ANA}::uuid, ${bia.spaceId}::uuid, ${TODAY}::date)`,
    ).rejects.toThrow(/unknown space/)
  })
})
