import { fluxiDb, seedUser, truncateFluxiTables } from '@/db'
import { accounts, banks, budgetPots, entries, entryOverrides, entryParts } from '@/db/schema'
import type { EntryFields } from '@/features/ledger/core/schemas'
import { and, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  getCountFrom,
  listAccounts,
  listBanks,
  listBudgetPots,
  listDescriptions,
} from './ledger.repo'
import {
  changeOccurrenceDay,
  createAccount,
  createBank,
  createEntry,
  deleteEntry,
  setCountFrom,
  setPotTargets,
  updateAccount,
  updateBank,
  updateEntry,
} from './ledger.write'
import { projectLedger } from './projection'

const ANA = '11111111-1111-4111-8111-111111111111'
const BIA = '22222222-2222-4222-8222-222222222222'

const db = () => fluxiDb.db()

type Setup = { bankId: string; accountId: string; otherAccountId: string }

async function setupUser(userId: string): Promise<Setup> {
  const bankId = randomUUID()
  const accountId = randomUUID()
  const otherAccountId = randomUUID()
  await createBank(userId, { id: bankId, name: 'BTG' })
  await createAccount(userId, {
    id: accountId,
    bankId,
    name: 'Conta',
    type: 'checking',
    openingBalanceCents: 100000,
  })
  await createAccount(userId, {
    id: otherAccountId,
    bankId,
    name: 'Reserva',
    type: 'investment',
    openingBalanceCents: 0,
  })
  await setCountFrom(userId, '2026-12')
  return { bankId, accountId, otherAccountId }
}

function expense(accountId: string, patch: Partial<EntryFields> = {}): EntryFields {
  return {
    kind: 'expense',
    description: 'Aluguel',
    amountCents: 200000,
    accountId,
    toAccountId: null,
    categoryId: null,
    pot: 'essential',
    tags: ['casa'],
    startMonth: '2026-12',
    day: 10,
    recurrence: 'monthly',
    installments: null,
    endMonth: null,
    parts: [],
    ...patch,
  }
}

async function entryRows(userId: string) {
  return db().select().from(entries).where(eq(entries.userId, userId)).orderBy(entries.startMonth)
}

async function overrideRows(entryId: string) {
  return db().select().from(entryOverrides).where(eq(entryOverrides.entryId, entryId))
}

async function expenseByMonth(userId: string): Promise<Record<string, number>> {
  const { months } = await projectLedger(userId, { from: '2026-12', to: '2027-04' })
  return Object.fromEntries(months.map((m) => [m.month, m.byBucket.available.expenseCents]))
}

let ana: Setup
let bia: Setup

beforeAll(async () => {
  await fluxiDb.migrate()
})

beforeEach(async () => {
  await truncateFluxiTables(db())
  await seedUser(db(), { id: ANA, email: 'ana@example.com' })
  await seedUser(db(), { id: BIA, email: 'bia@example.com' })
  ana = await setupUser(ANA)
  bia = await setupUser(BIA)
})

afterAll(async () => {
  await fluxiDb.close()
})

describe('createEntry', () => {
  it('creates the entry with its parts, idempotently', async () => {
    const id = randomUUID()
    const fields = expense(ana.accountId, {
      kind: 'income',
      pot: null,
      description: 'Salário',
      parts: [
        { label: 'Adiantamento', bps: 4000, day: 20, nextMonth: false },
        { label: 'Saldo', bps: 6000, day: 5, nextMonth: true },
      ],
    })
    await expect(createEntry(ANA, id, fields)).resolves.toEqual({ ok: true })
    await expect(createEntry(ANA, id, fields)).resolves.toEqual({ ok: true })
    expect(await entryRows(ANA)).toHaveLength(1)
    const parts = await db().select().from(entryParts).where(eq(entryParts.entryId, id))
    expect(parts.map((p) => [p.label, p.bps, p.sort])).toEqual([
      ['Adiantamento', 4000, 0],
      ['Saldo', 6000, 1],
    ])
    await expect(listDescriptions(ANA)).resolves.toEqual(['Salário'])
    await expect(listDescriptions(BIA)).resolves.toEqual([])
  })

  it('refuses another user’s account and does not leak a replayed id', async () => {
    await expect(createEntry(BIA, randomUUID(), expense(ana.accountId))).resolves.toEqual({
      ok: false,
      reason: 'invalid_reference',
    })
    const id = randomUUID()
    await createEntry(ANA, id, expense(ana.accountId))
    await expect(createEntry(BIA, id, expense(bia.accountId))).resolves.toEqual({
      ok: false,
      reason: 'not_found',
    })
    expect(await entryRows(BIA)).toHaveLength(0)
  })
})

describe('updateEntry', () => {
  let id: string
  beforeEach(async () => {
    id = randomUUID()
    await createEntry(ANA, id, expense(ana.accountId))
  })

  it('replaces every field of a whole-entry edit', async () => {
    const result = await updateEntry(
      ANA,
      id,
      expense(ana.accountId, {
        description: 'Aluguel novo',
        amountCents: 210000,
        startMonth: '2027-01',
      }),
      null,
    )
    expect(result).toEqual({ ok: true })
    const [row] = await entryRows(ANA)
    expect(row).toMatchObject({
      description: 'Aluguel novo',
      amountCents: 210000,
      startMonth: '2027-01-01',
    })
  })

  it('needs a scope when an occurrence amount changes', async () => {
    await expect(
      updateEntry(ANA, id, expense(ana.accountId, { amountCents: 250000 }), {
        month: '2027-02',
        scope: null,
      }),
    ).resolves.toEqual({ ok: false, reason: 'scope_required' })
  })

  it('applies series fields without a scope when amount and day are unchanged', async () => {
    await expect(
      updateEntry(ANA, id, expense(ana.accountId, { description: 'Moradia', tags: [] }), {
        month: '2027-02',
        scope: null,
      }),
    ).resolves.toEqual({ ok: true })
    const [row] = await entryRows(ANA)
    expect(row).toMatchObject({ description: 'Moradia', tags: [], startMonth: '2026-12-01' })
  })

  it('"one" writes an override for that month only', async () => {
    await updateEntry(ANA, id, expense(ana.accountId, { amountCents: 250000 }), {
      month: '2027-02',
      scope: 'one',
    })
    expect(await expenseByMonth(ANA)).toMatchObject({
      '2027-01': 200000,
      '2027-02': 250000,
      '2027-03': 200000,
    })
  })

  it('"future" splits the series inside one transaction', async () => {
    await updateEntry(ANA, id, expense(ana.accountId, { amountCents: 250000 }), {
      month: '2027-02',
      scope: 'one',
    })
    await updateEntry(ANA, id, expense(ana.accountId, { amountCents: 300000, day: 12 }), {
      month: '2027-03',
      scope: 'future',
    })
    const rows = await entryRows(ANA)
    expect(rows.map((r) => [r.startMonth, r.endMonth, r.amountCents, r.day])).toEqual([
      ['2026-12-01', '2027-02-01', 200000, 10],
      ['2027-03-01', null, 300000, 12],
    ])
    expect(await overrideRows(id)).toHaveLength(1)
    expect(await expenseByMonth(ANA)).toEqual({
      '2026-12': 200000,
      '2027-01': 200000,
      '2027-02': 250000,
      '2027-03': 300000,
      '2027-04': 300000,
    })
  })

  it('"all" edits the series and clears the patched field from overrides', async () => {
    await updateEntry(ANA, id, expense(ana.accountId, { amountCents: 250000 }), {
      month: '2027-02',
      scope: 'one',
    })
    await updateEntry(ANA, id, expense(ana.accountId, { amountCents: 220000 }), {
      month: '2027-01',
      scope: 'all',
    })
    expect(await overrideRows(id)).toHaveLength(0)
    expect(Object.values(await expenseByMonth(ANA))).toEqual([
      220000, 220000, 220000, 220000, 220000,
    ])
  })

  it('rolls back the whole edit when it fails midway', async () => {
    const result = await updateEntry(
      ANA,
      id,
      expense(ana.accountId, { amountCents: 300000, endMonth: '2027-01' }),
      { month: '2027-03', scope: 'future' },
    )
    expect(result).toEqual({ ok: false, reason: 'no_occurrence' })
    const [row] = await entryRows(ANA)
    expect(row).toMatchObject({ amountCents: 200000, endMonth: null })
  })

  it('is a no-op for another user', async () => {
    await expect(
      updateEntry(BIA, id, expense(bia.accountId, { description: 'Hack' }), null),
    ).resolves.toEqual({ ok: false, reason: 'not_found' })
    const [row] = await entryRows(ANA)
    expect(row?.description).toBe('Aluguel')
  })

  it('refuses moving the entry to another user’s account', async () => {
    await expect(updateEntry(ANA, id, expense(bia.accountId), null)).resolves.toEqual({
      ok: false,
      reason: 'invalid_reference',
    })
  })
})

describe('changeOccurrenceDay', () => {
  it('moves a one-off entry and scopes a recurring one', async () => {
    const once = randomUUID()
    const monthly = randomUUID()
    await createEntry(ANA, once, expense(ana.accountId, { recurrence: 'none' }))
    await createEntry(ANA, monthly, expense(ana.accountId))
    await expect(
      changeOccurrenceDay(ANA, { entryId: once, month: '2026-12', day: 3, scope: null }),
    ).resolves.toEqual({ ok: true })
    await expect(
      changeOccurrenceDay(ANA, { entryId: monthly, month: '2027-01', day: 3, scope: null }),
    ).resolves.toEqual({ ok: false, reason: 'scope_required' })
    await expect(
      changeOccurrenceDay(ANA, { entryId: monthly, month: '2027-01', day: 3, scope: 'one' }),
    ).resolves.toEqual({ ok: true })
    await expect(
      changeOccurrenceDay(ANA, { entryId: monthly, month: '2027-01', day: 3, scope: null }),
    ).resolves.toEqual({ ok: true })
    const [override] = await overrideRows(monthly)
    expect(override).toMatchObject({ month: '2027-01-01', day: 3 })
    await expect(
      changeOccurrenceDay(BIA, { entryId: monthly, month: '2027-01', day: 9, scope: 'all' }),
    ).resolves.toEqual({ ok: false, reason: 'not_found' })
    await expect(
      changeOccurrenceDay(ANA, { entryId: once, month: '2027-05', day: 9, scope: null }),
    ).resolves.toEqual({ ok: false, reason: 'no_occurrence' })
  })
})

describe('deleteEntry', () => {
  let id: string
  beforeEach(async () => {
    id = randomUUID()
    await createEntry(ANA, id, expense(ana.accountId))
  })

  it('"one" skips that occurrence', async () => {
    await deleteEntry(ANA, id, { month: '2027-01', scope: 'one' })
    await deleteEntry(ANA, id, { month: '2027-01', scope: 'one' })
    expect(await expenseByMonth(ANA)).toMatchObject({ '2027-01': 0, '2027-02': 200000 })
  })

  it('"future" ends the series before the month', async () => {
    await updateEntry(ANA, id, expense(ana.accountId, { amountCents: 1 }), {
      month: '2027-03',
      scope: 'one',
    })
    await deleteEntry(ANA, id, { month: '2027-02', scope: 'future' })
    const [row] = await entryRows(ANA)
    expect(row?.endMonth).toBe('2027-01-01')
    expect(await overrideRows(id)).toHaveLength(0)
  })

  it('"future" keeps the installments already due', async () => {
    const inst = randomUUID()
    await createEntry(
      ANA,
      inst,
      expense(ana.accountId, { recurrence: 'installments', installments: 12 }),
    )
    await deleteEntry(ANA, inst, { month: '2027-03', scope: 'future' })
    const [row] = await db().select().from(entries).where(eq(entries.id, inst))
    expect(row?.installments).toBe(3)
  })

  it('"future" from the first month and "all" delete the entry', async () => {
    await deleteEntry(ANA, id, { month: '2026-12', scope: 'future' })
    expect(await entryRows(ANA)).toHaveLength(0)
    const other = randomUUID()
    await createEntry(ANA, other, expense(ana.accountId))
    await deleteEntry(ANA, other, { month: '2027-02', scope: 'all' })
    expect(await entryRows(ANA)).toHaveLength(0)
  })

  it('is a no-op for another user', async () => {
    await expect(deleteEntry(BIA, id, null)).resolves.toEqual({ ok: false, reason: 'not_found' })
    await expect(deleteEntry(BIA, id, { month: '2027-01', scope: 'one' })).resolves.toEqual({
      ok: false,
      reason: 'not_found',
    })
    expect(await entryRows(ANA)).toHaveLength(1)
    await expect(deleteEntry(ANA, id, { month: '2026-10', scope: 'one' })).resolves.toEqual({
      ok: false,
      reason: 'no_occurrence',
    })
  })
})

describe('banks and accounts', () => {
  it('creates idempotently and updates only the owner’s rows', async () => {
    const bankId = randomUUID()
    await createBank(ANA, { id: bankId, name: 'Nubank' })
    await createBank(ANA, { id: bankId, name: 'Nubank' })
    expect((await listBanks(ANA)).map((b) => [b.name, b.sort])).toEqual([
      ['BTG', 0],
      ['Nubank', 1],
    ])
    await expect(updateBank(BIA, { id: bankId, name: 'Hack' })).resolves.toEqual({
      ok: false,
      reason: 'not_found',
    })
    await expect(updateBank(ANA, { id: bankId, name: 'Nu' })).resolves.toEqual({ ok: true })

    await expect(
      createAccount(BIA, {
        id: randomUUID(),
        bankId,
        name: 'X',
        type: 'checking',
        openingBalanceCents: 0,
      }),
    ).resolves.toEqual({ ok: false, reason: 'invalid_reference' })

    const base = {
      id: ana.accountId,
      name: 'Conta principal',
      type: 'checking' as const,
      openingBalanceCents: 5,
    }
    await expect(updateAccount(BIA, { ...base, archived: true })).resolves.toEqual({
      ok: false,
      reason: 'not_found',
    })
    await updateAccount(ANA, { ...base, archived: true })
    const [first] = await db().select().from(accounts).where(eq(accounts.id, ana.accountId))
    await updateAccount(ANA, { ...base, archived: true })
    const [second] = await db().select().from(accounts).where(eq(accounts.id, ana.accountId))
    expect(second?.archivedAt).toEqual(first?.archivedAt)
    await updateAccount(ANA, { ...base, archived: false })
    const listed = (await listAccounts(ANA)).find((a) => a.id === ana.accountId)
    expect(listed).toMatchObject({
      name: 'Conta principal',
      openingBalanceCents: 5,
      archived: false,
    })
    const biaBanks = await db().select().from(banks).where(eq(banks.userId, BIA))
    expect(biaBanks.map((b) => b.name)).toEqual(['BTG'])
  })
})

describe('settings', () => {
  it('sets pot targets within 100% and only for the user', async () => {
    await expect(
      setPotTargets(ANA, {
        essential: 4300,
        comfort: 700,
        guilt_free: 700,
        education: 300,
        variable: 800,
        investment: 3200,
      }),
    ).resolves.toEqual({ ok: true })
    await expect(
      setPotTargets(ANA, {
        essential: 9000,
        comfort: 700,
        guilt_free: 700,
        education: 300,
        variable: 800,
        investment: 3200,
      }),
    ).resolves.toEqual({ ok: false, reason: 'over_budget' })
    expect((await listBudgetPots(ANA)).find((p) => p.key === 'essential')?.targetBps).toBe(4300)
    expect((await listBudgetPots(BIA)).find((p) => p.key === 'essential')?.targetBps).toBe(3300)
    const rows = await db()
      .select()
      .from(budgetPots)
      .where(and(eq(budgetPots.userId, ANA), eq(budgetPots.key, 'essential')))
    expect(rows).toHaveLength(1)
  })

  it('sets count_from_month per user', async () => {
    await setCountFrom(ANA, '2027-03')
    await expect(getCountFrom(ANA)).resolves.toBe('2027-03')
    await expect(getCountFrom(BIA)).resolves.toBe('2026-12')
  })
})
