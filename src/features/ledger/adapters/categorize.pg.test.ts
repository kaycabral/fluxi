import { fluxiDb, personalScope, seedUser, truncateFluxiTables } from '@/db'
import { ownerDb } from '@/db/owner'
import { accounts, banks, budgetGroups, categories, entries } from '@/db/schema'
import {
  bankEntryLinks,
  bankFeedAccounts,
  bankTransactions,
  categorizationRules,
} from '@/db/schema-bank-feed'
import type { Scope } from '@/features/spaces/core/space'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  categorizeEntries,
  deleteRule,
  findSimilarBankEntries,
  listRules,
} from './categorize.write'

const ANA = '11111111-1111-4111-8111-111111111111'
const BIA = '22222222-2222-4222-8222-222222222222'
const db = () => fluxiDb.db()

let ana: Scope
let bia: Scope
let accountId: string
let otherAccountId: string
let bakery: string

async function seedAccount(scope: Scope, name: string): Promise<string> {
  const [bank] = await db()
    .insert(banks)
    .values({ ...scope, name: `Banco ${name}` })
    .returning()
  if (bank === undefined) throw new Error('bank')
  const [account] = await db()
    .insert(accounts)
    .values({ ...scope, bankId: bank.id, name, type: 'checking', openingBalanceCents: 0 })
    .returning()
  if (account === undefined) throw new Error('account')
  return account.id
}

async function entry(
  scope: Scope,
  description: string,
  amountCents: number,
  over: {
    fromBank?: boolean
    kind?: 'income' | 'expense' | 'transfer'
    account?: string
    merchant?: string
  } = {},
): Promise<string> {
  const kind = over.kind ?? (amountCents < 0 ? 'expense' : 'income')
  const [row] = await db()
    .insert(entries)
    .values({
      ...scope,
      kind,
      description,
      amountCents,
      accountId: over.account ?? accountId,
      toAccountId: kind === 'transfer' ? otherAccountId : null,
      startMonth: '2026-11-01',
      day: 10,
      recurrence: 'none',
    })
    .returning()
  if (row === undefined) throw new Error('entry')
  if (over.merchant !== undefined) {
    await db()
      .insert(bankEntryLinks)
      .values({ ...scope, entryId: row.id, bankTransactionId: await bankTransaction(scope, over) })
  } else if (over.fromBank ?? true) {
    await db()
      .insert(bankEntryLinks)
      .values({ ...scope, entryId: row.id })
  }
  return row.id
}

let feedAccountId: string | null = null

/** A bank transaction carrying the merchant (one feed account for the test). */
async function bankTransaction(scope: Scope, over: { merchant?: string }): Promise<string> {
  if (feedAccountId === null) {
    const [feedAccount] = await db()
      .insert(bankFeedAccounts)
      .values({
        ...scope,
        source: 'pluggy',
        externalId: 'acc',
        itemId: 'item',
        institution: 'BTG',
        name: 'Conta',
        type: 'BANK',
        subtype: 'CHECKING_ACCOUNT',
        balanceCents: 0,
        syncedAt: new Date(),
      })
      .returning()
    if (feedAccount === undefined) throw new Error('feed account')
    feedAccountId = feedAccount.id
  }
  const [tx] = await db()
    .insert(bankTransactions)
    .values({
      ...scope,
      feedAccountId,
      externalId: crypto.randomUUID(),
      date: '2026-11-10',
      amountCents: -1000,
      description: 'Compra no débito',
      status: 'POSTED',
      merchantName: over.merchant,
      syncedAt: new Date(),
    })
    .returning()
  if (tx === undefined) throw new Error('bank transaction')
  return tx.id
}

const rowOf = async (id: string) => {
  const [row] = await db().select().from(entries).where(eq(entries.id, id))
  return row
}

beforeEach(async () => {
  await truncateFluxiTables(ownerDb.db())
  feedAccountId = null
  await seedUser(ownerDb.db(), { id: ANA, email: 'ana@example.test' })
  await seedUser(ownerDb.db(), { id: BIA, email: 'bia@example.test' })
  ana = await personalScope(db(), ANA)
  bia = await personalScope(db(), BIA)
  accountId = await seedAccount(ana, 'Conta')
  otherAccountId = await seedAccount(ana, 'Outra')
  const [category] = await db()
    .insert(categories)
    .values({ ...ana, name: 'Padaria', groupName: 'Teste' })
    .returning()
  if (category === undefined) throw new Error('category')
  bakery = category.id
})

describe('findSimilarBankEntries', () => {
  it('finds bank one-off entries with the same normalized description', async () => {
    const source = await entry(ana, 'ATM VENEZA 01', -1000)
    const small = await entry(ana, 'atm veneza 77', -1200)
    const big = await entry(ana, 'Atm Veneza', -35000)
    await entry(ana, 'ATM VENEZA manual', -1000, { fromBank: false })
    await entry(ana, 'ATM VENEZA', -1000, { fromBank: false })
    await entry(ana, 'Outra', -1000)
    const found = await findSimilarBankEntries(ana, source)
    expect(found?.reference).toMatchObject({ id: source, amountCents: -1000 })
    expect(found?.candidates.map((c) => c.id).sort()).toEqual([small, big].sort())
    expect(found?.candidates[0]).toMatchObject({ date: '2026-11-10', accountId })
    expect(await findSimilarBankEntries(bia, source)).toBeNull()
  })
})

describe('merchant as similarity key', () => {
  it('matches by merchant when the entry has one, and records a merchant rule', async () => {
    const source = await entry(ana, 'Compra no débito', -1000, { merchant: 'Padaria Pão' })
    const same = await entry(ana, 'COMPRA NO DEBITO', -1100, { merchant: 'PADARIA PAO' })
    const otherText = await entry(ana, 'Pix', -900, { merchant: 'Padaria Pão' })
    await entry(ana, 'Compra no débito', -1000, { merchant: 'Uber' })
    await entry(ana, 'Compra no débito', -1000)
    const found = await findSimilarBankEntries(ana, source)
    expect(found?.reference).toMatchObject({ merchantName: 'Padaria Pão', by: 'merchant' })
    expect(found?.candidates.map((c) => c.id).sort()).toEqual([same, otherText].sort())

    await categorizeEntries(ana, {
      entryIds: [same],
      categoryId: bakery,
      ruleFromEntryId: source,
    })
    expect(await listRules(ana)).toMatchObject([{ pattern: null, merchantKey: 'padaria pao' }])
  })
})

describe('categorizeEntries', () => {
  it('sets only category and budget group, never on transfers, budget group only on expenses', async () => {
    const out = await entry(ana, 'A', -1000)
    const manual = await entry(ana, 'B', -2000, { fromBank: false })
    const income = await entry(ana, 'C', 3000)
    const transfer = await entry(ana, 'D', -500, { kind: 'transfer' })
    const result = await categorizeEntries(ana, {
      entryIds: [out, manual, income, transfer],
      categoryId: bakery,
      budgetGroup: 'essential',
    })
    expect(result).toEqual({ ok: true })
    expect(await rowOf(out)).toMatchObject({
      categoryId: bakery,
      budgetGroup: 'essential',
      amountCents: -1000,
    })
    expect(await rowOf(manual)).toMatchObject({ categoryId: bakery, budgetGroup: 'essential' })
    expect(await rowOf(income)).toMatchObject({ categoryId: bakery, budgetGroup: null })
    expect(await rowOf(transfer)).toMatchObject({ categoryId: null, budgetGroup: null })

    // Only the budget group: the category stays.
    await categorizeEntries(ana, { entryIds: [out], budgetGroup: 'comfort' })
    expect(await rowOf(out)).toMatchObject({ categoryId: bakery, budgetGroup: 'comfort' })
  })

  it('refuses entries, categories and budget groups of another space', async () => {
    const own = await entry(ana, 'A', -1000)
    const biaAccount = await seedAccount(bia, 'Bia')
    const theirs = await entry(bia, 'B', -1000, { account: biaAccount })
    expect(
      await categorizeEntries(ana, { entryIds: [own, theirs], budgetGroup: 'essential' }),
    ).toEqual({
      ok: false,
      reason: 'not_found',
    })
    expect(await rowOf(own)).toMatchObject({ budgetGroup: null })
    expect(await categorizeEntries(bia, { entryIds: [theirs], categoryId: bakery })).toEqual({
      ok: false,
      reason: 'invalid_reference',
    })
    await db()
      .update(budgetGroups)
      .set({ archivedAt: new Date() })
      .where(eq(budgetGroups.key, 'comfort'))
    expect(await categorizeEntries(ana, { entryIds: [own], budgetGroup: 'comfort' })).toEqual({
      ok: false,
      reason: 'invalid_reference',
    })
  })

  it('records a rule over the range of the checked amounts, and deletes it', async () => {
    const source = await entry(ana, 'ATM VENEZA 01', -1000)
    const a = await entry(ana, 'ATM VENEZA 02', -800)
    const b = await entry(ana, 'ATM VENEZA 03', -1500)
    await categorizeEntries(ana, {
      entryIds: [a, b],
      categoryId: bakery,
      budgetGroup: 'essential',
      ruleFromEntryId: source,
    })
    const rules = await listRules(ana)
    expect(rules).toMatchObject([
      {
        pattern: 'atm veneza',
        minCents: 800,
        maxCents: 1500,
        categoryId: bakery,
        budgetGroup: 'essential',
      },
    ])
    expect(await listRules(bia)).toEqual([])
    const id = rules[0]?.id ?? ''
    expect(await deleteRule(bia, id)).toEqual({ ok: false, reason: 'not_found' })
    expect(await deleteRule(ana, id)).toEqual({ ok: true })
    expect(await db().select().from(categorizationRules)).toHaveLength(0)
  })
})
