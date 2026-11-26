import { fluxiDb, personalScope, seedUser, truncateFluxiTables } from '@/db'
import { accounts, banks, categories, entries } from '@/db/schema'
import { bankEntryLinks, bankFeedAccounts, categorizationRules } from '@/db/schema-bank-feed'
import { feedEntryDescription, GENERIC_DESCRIPTIONS } from '@/features/bank-feed/core/merchant'
import type { FeedAccountRow, FeedTransactionRow } from '@/features/bank-feed/core/pluggy'
import { TRANSFER_SIGNAL_EXAMPLES } from '@/features/bank-feed/core/transfer'
import { descriptionKey } from '@/features/ledger/core/similar'
import type { Scope } from '@/features/spaces/core/space'
import { requireEnv } from '@cbrl/env'
import { and, eq, isNull, sql } from 'drizzle-orm'
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
}
const cardFeed: FeedAccountRow = {
  ...checkingFeed,
  externalId: 'acc-card',
  name: 'Cartão',
  type: 'CREDIT',
  subtype: 'CREDIT_CARD',
  balanceCents: 30000,
  numberHint: '1234',
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

describe('merchant description (SQL = TS)', () => {
  it('agrees with feedEntryDescription', async () => {
    const samples = [
      ...GENERIC_DESCRIPTIONS,
      'Compra no débito autorizada',
      'COMPRA NO CRÉDITO 12/03',
      'Transferência',
      'Padaria São João',
      'Pix enviado Maria',
      '',
    ]
    for (const description of samples) {
      for (const merchant of ['Padaria Pão', ' ', null]) {
        const { rows } = await db().execute<{ value: string }>(
          sql`select private.feed_entry_description(${description}, ${merchant}) as value`,
        )
        expect(rows[0]?.value).toBe(feedEntryDescription(description, merchant))
      }
    }
  })
})

describe('merchant names bank entries (Postgres)', () => {
  const generic = 'Compra no débito autorizada'

  it('creates a generic bank entry under the merchant name and categorizes by it', async () => {
    const bakery = await categoryId(ana, 'Padaria')
    await db()
      .insert(categorizationRules)
      .values({ ...ana, pattern: 'padaria pao', minCents: 0, maxCents: 10000, categoryId: bakery })
    await feed(ana, checkingFeed, [
      tx('a', { description: generic, merchantName: 'Padaria Pão' }),
      tx('b', { description: generic }),
      tx('c', { description: 'UBER *TRIP', merchantName: 'Uber' }),
    ])
    await map(ana, 'acc-checking', checkingId)
    expect(await materialize()).toMatchObject({ created: 3, named: 0, categorized: 1 })
    const rows = await entriesOf(ana)
    expect(rows.map((e) => e.description).sort()).toEqual([generic, 'Padaria Pão', 'UBER *TRIP'])
    expect(rows.find((e) => e.description === 'Padaria Pão')?.categoryId).toBe(bakery)
  })

  it('renames existing entries only while they keep the bank text', async () => {
    await feed(ana, checkingFeed, [
      tx('a', { description: generic }),
      tx('b', { description: generic }),
    ])
    await map(ana, 'acc-checking', checkingId)
    expect(await materialize()).toMatchObject({ created: 2 })
    const [first] = await entriesOf(ana)
    if (first === undefined) throw new Error('missing')
    await db().update(entries).set({ description: 'Minha' }).where(eq(entries.id, first.id))

    // The merchant arrives on a later sync.
    await feed(ana, checkingFeed, [
      tx('a', { description: generic, merchantName: 'Padaria Pão' }),
      tx('b', { description: generic, merchantName: 'Padaria Pão' }),
    ])
    expect(await materialize()).toMatchObject({ created: 0, named: 1 })
    const rows = await entriesOf(ana)
    expect(rows.find((e) => e.id === first.id)?.description).toBe('Minha')
    expect(rows.find((e) => e.id !== first.id)?.description).toBe('Padaria Pão')
    expect(await materialize()).toMatchObject({ named: 0 })
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
          pot: 'essential',
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
    expect(of('ATM VENEZA 01')).toMatchObject({ categoryId: bakery, pot: 'essential' })
    expect(of('Atm Veneza 02')).toMatchObject({ categoryId: null, pot: null })
    expect(of('Outra coisa')).toMatchObject({ categoryId: null, pot: null })

    // Never overwrites the user.
    const c = of('ATM VENEZA 03')
    if (c === undefined) throw new Error('missing')
    await db().update(entries).set({ categoryId: market, pot: null }).where(eq(entries.id, c.id))
    await feed(ana, checkingFeed, [
      tx('a', { description: 'ATM VENEZA 01', amountCents: -1200 }),
      tx('b', { description: 'Atm Veneza 02', amountCents: -35000 }),
      tx('c', { description: 'ATM VENEZA 03', amountCents: -900 }),
      tx('d', { description: 'Outra coisa', amountCents: -1000 }),
      tx('e', { description: 'ATM VENEZA 99', amountCents: -1500, date: '2026-11-20' }),
    ])
    expect(await materialize()).toMatchObject({ created: 1, categorized: 1 })
    const after = await entriesOf(ana)
    expect(after.find((e) => e.id === c.id)).toMatchObject({ categoryId: market, pot: null })
    expect(after.find((e) => e.description === 'ATM VENEZA 99')).toMatchObject({
      categoryId: bakery,
      pot: 'essential',
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
