import { fluxiDb, personalScope, seedUser, truncateFluxiTables } from '@/db'
import { accounts, banks, categories, entries } from '@/db/schema'
import { bankEntryLinks, bankFeedAccounts, categorizationRules } from '@/db/schema-bank-feed'
import type { FeedAccountRow, FeedTransactionRow } from '@/features/bank-feed/core/pluggy'
import { TRANSFER_SIGNAL_EXAMPLES } from '@/features/bank-feed/core/transfer'
import { descriptionKey } from '@/features/ledger/core/similar'
import type { Scope } from '@/features/spaces/core/space'
import { requireEnv } from '@cbrl/env'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { readFileSync } from 'node:fs'
import postgres from 'postgres'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { syncFeedAccount } from './feed.write'
import { materializeSpace } from './sync'

const ANA = '11111111-1111-4111-8111-111111111111'
const BIA = '22222222-2222-4222-8222-222222222222'
const TODAY = '2026-11-25'

const db = () => fluxiDb.db()
const asSync = postgres(requireEnv('POSTGRES_URL'), { prepare: false, max: 1 })

let ana: Scope
let checkingId: string
let cardId: string

const checkingFeed: FeedAccountRow = {
  externalId: 'acc-checking',
  itemId: 'item-1',
  institution: 'BTG',
  name: 'Conta',
  type: 'BANK',
  subtype: 'CHECKING_ACCOUNT',
  balanceCents: 100000,
  numberHint: '4821',
  cardStatus: null,
}
const cardFeed: FeedAccountRow = {
  ...checkingFeed,
  externalId: 'acc-card',
  name: 'Cartão',
  type: 'CREDIT',
  subtype: 'CREDIT_CARD',
  balanceCents: 30000,
  numberHint: '1234',
  cardStatus: null,
}

const tx = (externalId: string, over: Partial<FeedTransactionRow> = {}): FeedTransactionRow => ({
  externalId,
  date: '2026-11-10',
  amountCents: -5000,
  description: `Banco ${externalId}`,
  status: 'POSTED',
  category: null,
  operationType: null,
  installmentNumber: null,
  totalInstallments: null,
  billMonth: null,
  merchantName: null,
  merchantCategory: null,
  ...over,
})

async function feed(scope: Scope, acc: FeedAccountRow, rows: FeedTransactionRow[]) {
  await syncFeedAccount(asSync, scope, {
    source: 'pluggy',
    account: acc,
    transactions: rows,
    coveredFrom: '2026-01-01',
  })
  await db()
    .update(bankFeedAccounts)
    .set({ mappingSource: 'manual' })
    .where(and(eq(bankFeedAccounts.spaceId, scope.spaceId), isNull(bankFeedAccounts.mappingSource)))
}

async function map(scope: Scope, externalId: string, accountId: string) {
  await db()
    .update(bankFeedAccounts)
    .set({ accountId, mappingSource: 'manual' })
    .where(
      and(eq(bankFeedAccounts.spaceId, scope.spaceId), eq(bankFeedAccounts.externalId, externalId)),
    )
}

const materialize = (scope: Scope = ana) => materializeSpace(asSync, scope, TODAY)

const entriesOf = (scope: Scope) =>
  db().select().from(entries).where(eq(entries.spaceId, scope.spaceId)).orderBy(entries.description)

async function categoryId(scope: Scope, name: string): Promise<string> {
  const [row] = await db()
    .insert(categories)
    .values({ ...scope, name, groupName: 'Teste' })
    .returning()
  if (row === undefined) throw new Error('category not created')
  return row.id
}

beforeAll(async () => {
  await asSync`set role fluxi_sync`
})

beforeEach(async () => {
  await truncateFluxiTables(db())
  await seedUser(db(), { id: ANA, email: 'ana@example.test' })
  await seedUser(db(), { id: BIA, email: 'bia@example.test' })
  ana = await personalScope(db(), ANA)
  const [bank] = await db()
    .insert(banks)
    .values({ ...ana, name: 'BTG' })
    .returning()
  if (bank === undefined) throw new Error('bank not created')
  const [checking, card] = await db()
    .insert(accounts)
    .values([
      { ...ana, bankId: bank.id, name: 'Conta', type: 'checking', openingBalanceCents: 0 },
      { ...ana, bankId: bank.id, name: 'Cartão', type: 'credit', openingBalanceCents: 0 },
    ])
    .returning()
  if (checking === undefined || card === undefined) throw new Error('accounts not created')
  checkingId = checking.id
  cardId = card.id
})

afterAll(async () => {
  await truncateFluxiTables(db())
  await asSync.end()
})

describe('transfer signal (SQL = TS)', () => {
  it('agrees with isTransferPair on the production combinations', async () => {
    for (const { a, b, pair } of TRANSFER_SIGNAL_EXAMPLES) {
      const { rows } = await db().execute<{ pair: boolean }>(
        sql`select private.feed_transfer_pair(${a.category}, ${a.operationType}, ${b.category}, ${b.operationType}) as pair`,
      )
      expect(rows[0]?.pair).toBe(pair)
    }
  })

  it('agrees with descriptionKey', async () => {
    for (const raw of ['ATM VENEZA 0412', 'Padaria SÃO João*22/11', '  pix-123 ', 'Ação', '']) {
      const { rows } = await db().execute<{ key: string }>(
        sql`select private.description_key(${raw}) as key`,
      )
      expect(rows[0]?.key).toBe(descriptionKey(raw))
    }
  })
})

/** One statement of a migration, found by its first line. */
function migrationStatement(file: string, startsWith: string): string {
  const found = readFileSync(`drizzle/${file}`, 'utf8')
    .split('--> statement-breakpoint')
    .map((part) =>
      part
        .split('\n')
        .filter((line) => !line.startsWith('--'))
        .join('\n')
        .trim(),
    )
    .find((part) => part.startsWith(startsWith))
  if (found === undefined) throw new Error(`${startsWith} not in ${file}`)
  return found
}

class Rollback extends Error {}

describe('merchant is extra information (Postgres)', () => {
  const generic = 'Compra no débito autorizada'

  it('keeps the bank description and categorizes by merchant first', async () => {
    const bakery = await categoryId(ana, 'Padaria')
    const market = await categoryId(ana, 'Mercado')
    await db()
      .insert(categorizationRules)
      .values([
        { ...ana, merchantKey: 'padaria pao', minCents: 0, maxCents: 10000, categoryId: bakery },
        {
          ...ana,
          pattern: descriptionKey(generic),
          minCents: 0,
          maxCents: 10000,
          categoryId: market,
          createdAt: new Date(Date.now() + 1000),
        },
      ])
    await feed(ana, checkingFeed, [
      tx('a', { description: generic, merchantName: 'Padaria Pão' }),
      tx('b', { description: generic }),
      tx('c', { description: 'UBER *TRIP', merchantName: 'Uber' }),
    ])
    await map(ana, 'acc-checking', checkingId)
    expect(await materialize()).toMatchObject({ created: 3, named: 0, categorized: 2 })
    const rows = await entriesOf(ana)
    expect(rows.map((e) => e.description).sort()).toEqual([generic, generic, 'UBER *TRIP'])
    const links = await db().select().from(bankEntryLinks)
    const entryOf = async (externalId: string) => {
      const { rows: found } = await db().execute<{ id: string }>(
        sql`select id from bank_transactions where external_id = ${externalId}`,
      )
      const link = links.find((l) => l.bankTransactionId === found[0]?.id)
      return rows.find((e) => e.id === link?.entryId)
    }
    // Merchant rule beats the newer description rule; no merchant → description.
    expect((await entryOf('a'))?.categoryId).toBe(bakery)
    expect((await entryOf('b'))?.categoryId).toBe(market)
    expect((await entryOf('c'))?.categoryId).toBeNull()
  })

  it('rejects a rule with both keys or none', async () => {
    const bakery = await categoryId(ana, 'Padaria')
    const base = { ...ana, minCents: 0, maxCents: 1, categoryId: bakery }
    await expect(
      db()
        .insert(categorizationRules)
        .values({ ...base, pattern: 'a', merchantKey: 'b' }),
    ).rejects.toThrow()
    await expect(db().insert(categorizationRules).values(base)).rejects.toThrow()
  })

  it('migration 0027 reverts only the entries 0025 renamed', async () => {
    await feed(ana, checkingFeed, [
      tx('renamed', { description: generic, merchantName: 'Padaria Pão' }),
      tx('edited', { description: generic, merchantName: 'Padaria Pão' }),
      tx('specific', { description: 'PADARIA PAO 22', merchantName: 'Padaria Pão' }),
      tx('plain', { description: generic }),
    ])
    await map(ana, 'acc-checking', checkingId)
    await materialize()
    const { rows: ids } = await db().execute<{ external_id: string; entry_id: string }>(
      sql`select t.external_id, l.entry_id from bank_entry_links l
          join bank_transactions t on t.id = l.bank_transaction_id`,
    )
    const id = (externalId: string) => ids.find((r) => r.external_id === externalId)?.entry_id ?? ''
    const rename = (externalId: string, description: string) =>
      db()
        .update(entries)
        .set({ description })
        .where(eq(entries.id, id(externalId)))
    // As 0025 left them: renamed after the merchant, or edited by the user.
    await rename('renamed', 'Padaria Pão')
    await rename('edited', 'Pão da esquina')
    await rename('specific', 'Padaria Pão')

    const generic0025 = migrationStatement(
      '0025_feed_merchant.sql',
      'CREATE OR REPLACE FUNCTION private.feed_generic_description',
    )
    const revert = migrationStatement('0027_merchant_as_info.sql', 'UPDATE public.entries e SET')
    let after: { id: string; description: string }[] = []
    // Run 0027's revert over 0025's state, then roll back (the suite's database
    // is already past both).
    await expect(
      db().transaction(async (t) => {
        await t.execute(sql.raw(generic0025))
        await t.execute(sql.raw(revert))
        after = await t.select().from(entries).where(eq(entries.spaceId, ana.spaceId))
        throw new Rollback()
      }),
    ).rejects.toThrow(Rollback)
    const of = (externalId: string) => after.find((e) => e.id === id(externalId))?.description
    expect(of('renamed')).toBe(generic)
    expect(of('edited')).toBe('Pão da esquina')
    // The bank's text was specific: 0025 never renamed it, so it is the user's.
    expect(of('specific')).toBe('Padaria Pão')
    expect(of('plain')).toBe(generic)
  })
})

describe('transfers only from the bank signal (Postgres)', () => {
  it('never pairs by amount alone', async () => {
    await feed(ana, checkingFeed, [
      tx('pix', { amountCents: -4200, category: 'Transfers', operationType: 'PIX' }),
    ])
    await feed(ana, cardFeed, [
      tx('atm', { amountCents: 4200, category: 'Shopping', operationType: 'CARTAO' }),
    ])
    await map(ana, 'acc-checking', checkingId)
    await map(ana, 'acc-card', cardId)
    expect(await materialize()).toMatchObject({ transfers: 0, created: 2 })
    expect((await entriesOf(ana)).map((e) => e.kind)).toEqual(['income', 'expense'])
  })

  it('pairs a bank slip paying the card bill', async () => {
    await feed(ana, checkingFeed, [
      tx('slip', {
        amountCents: -30000,
        category: 'Transfer - Bank Slip',
        operationType: 'BOLETO',
      }),
    ])
    await feed(ana, cardFeed, [
      tx('bill', {
        amountCents: 30000,
        category: 'Credit card payment',
        operationType: 'PAGAMENTO_FATURA',
      }),
    ])
    await map(ana, 'acc-checking', checkingId)
    await map(ana, 'acc-card', cardId)
    expect(await materialize()).toMatchObject({ transfers: 1, created: 0 })
  })

  it('splits a transfer that lost its signal back into singles, idempotently', async () => {
    await feed(ana, checkingFeed, [
      tx('out', { amountCents: -4200, category: 'Same person transfer', operationType: 'PIX' }),
    ])
    await feed(ana, cardFeed, [
      tx('in', { amountCents: 4200, category: 'Same person transfer', operationType: 'PIX' }),
    ])
    await map(ana, 'acc-checking', checkingId)
    await map(ana, 'acc-card', cardId)
    expect(await materialize()).toMatchObject({ transfers: 1 })
    const [transfer] = await entriesOf(ana)
    if (transfer === undefined) throw new Error('no transfer')
    await db().update(entries).set({ description: 'Minha' }).where(eq(entries.id, transfer.id))

    // As production had it: the pair was matched by value, the signal is not there.
    await feed(ana, checkingFeed, [
      tx('out', { amountCents: -4200, category: 'Shopping', operationType: 'CARTAO' }),
    ])
    await feed(ana, cardFeed, [
      tx('in', { amountCents: 4200, category: 'Transfers', operationType: 'PIX' }),
    ])
    expect(await materialize()).toMatchObject({ split: 1, created: 1, transfers: 0 })
    const rows = await entriesOf(ana)
    expect(rows.map((e) => [e.description, e.kind, e.amountCents, e.toAccountId])).toEqual([
      ['Banco in', 'income', 4200, null],
      ['Minha', 'expense', -4200, null],
    ])
    expect(rows.find((e) => e.kind === 'expense')?.id).toBe(transfer.id)
    expect(rows.find((e) => e.kind === 'expense')?.accountId).toBe(checkingId)
    const links = await db().select().from(bankEntryLinks)
    expect(new Set(links.map((l) => l.entryId)).size).toBe(2)

    expect(await materialize()).toMatchObject({ split: 0, created: 0, transfers: 0, updated: 0 })
  })
})

describe('categorization rules (Postgres)', () => {
  it('classifies only new or unclassified bank entries in range, newest rule first', async () => {
    const bakery = await categoryId(ana, 'Padaria')
    const market = await categoryId(ana, 'Mercado')
    await db()
      .insert(categorizationRules)
      .values([
        { ...ana, pattern: 'atm veneza', minCents: 500, maxCents: 2000, categoryId: market },
        {
          ...ana,
          pattern: 'atm veneza',
          minCents: 500,
          maxCents: 2000,
          categoryId: bakery,
          budgetGroup: 'essential',
          createdAt: new Date(Date.now() + 1000),
        },
      ])
    await feed(ana, checkingFeed, [
      tx('a', { description: 'ATM VENEZA 01', amountCents: -1200 }),
      tx('b', { description: 'Atm Veneza 02', amountCents: -35000 }),
      tx('c', { description: 'ATM VENEZA 03', amountCents: -900 }),
      tx('d', { description: 'Outra coisa', amountCents: -1000 }),
    ])
    await map(ana, 'acc-checking', checkingId)
    expect(await materialize()).toMatchObject({ created: 4, categorized: 2 })
    const rows = await entriesOf(ana)
    const of = (d: string) => rows.find((e) => e.description === d)
    expect(of('ATM VENEZA 01')).toMatchObject({ categoryId: bakery, budgetGroup: 'essential' })
    expect(of('Atm Veneza 02')).toMatchObject({ categoryId: null, budgetGroup: null })
    expect(of('Outra coisa')).toMatchObject({ categoryId: null, budgetGroup: null })

    // Never overwrites the user.
    const c = of('ATM VENEZA 03')
    if (c === undefined) throw new Error('missing')
    await db()
      .update(entries)
      .set({ categoryId: market, budgetGroup: null })
      .where(eq(entries.id, c.id))
    await feed(ana, checkingFeed, [
      tx('a', { description: 'ATM VENEZA 01', amountCents: -1200 }),
      tx('b', { description: 'Atm Veneza 02', amountCents: -35000 }),
      tx('c', { description: 'ATM VENEZA 03', amountCents: -900 }),
      tx('d', { description: 'Outra coisa', amountCents: -1000 }),
      tx('e', { description: 'ATM VENEZA 99', amountCents: -1500, date: '2026-11-20' }),
    ])
    expect(await materialize()).toMatchObject({ created: 1, categorized: 1 })
    const after = await entriesOf(ana)
    expect(after.find((e) => e.id === c.id)).toMatchObject({
      categoryId: market,
      budgetGroup: null,
    })
    expect(after.find((e) => e.description === 'ATM VENEZA 99')).toMatchObject({
      categoryId: bakery,
      budgetGroup: 'essential',
    })
  })

  it('keeps rules inside their space', async () => {
    const bia = await personalScope(db(), BIA)
    const biaCategory = await categoryId(bia, 'Padaria')
    await expect(
      db()
        .insert(categorizationRules)
        .values({ ...ana, pattern: 'x', minCents: 0, maxCents: 1, categoryId: biaCategory }),
    ).rejects.toThrow()
    await expect(asSync`select 1 from categorization_rules limit 1`).rejects.toThrow(
      /permission denied/,
    )
  })
})
