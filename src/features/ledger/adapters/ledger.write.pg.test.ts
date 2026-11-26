import { fluxiDb, personalScope, seedUser, truncateFluxiTables } from '@/db'
import { accounts, banks, entries, entryOverrides, entryParts } from '@/db/schema'
import type { EntryFields } from '@/features/ledger/core/schemas'
import type { Scope } from '@/features/spaces/core/space'
import { pgErrorOf } from '@cbrl/pg'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { getCountFrom, listAccounts, listBanks } from './ledger.repo'
import {
  changeOccurrenceDay,
  createAccount,
  createBank,
  createEntry,
  deleteEntry,
  setCountFrom,
  updateAccount,
  updateBank,
  updateEntry,
} from './ledger.write'
import { projectLedger } from './projection'

const ANA = '11111111-1111-4111-8111-111111111111'
const BIA = '22222222-2222-4222-8222-222222222222'

let anaScope: Scope
let biaScope: Scope

const db = () => fluxiDb.db()

type Setup = { bankId: string; accountId: string; otherAccountId: string }

async function setupUser(scope: Scope): Promise<Setup> {
  const bankId = randomUUID()
  const accountId = randomUUID()
  const otherAccountId = randomUUID()
  await createBank(scope, { id: bankId, name: 'BTG' })
  await createAccount(scope, {
    id: accountId,
    bankId,
    name: 'Conta',
    type: 'checking',
    openingBalanceCents: 100000,
  })
  await createAccount(scope, {
    id: otherAccountId,
    bankId,
    name: 'Reserva',
    type: 'investment',
    openingBalanceCents: 0,
  })
  await setCountFrom(scope, '2026-12')
  return { bankId, accountId, otherAccountId }
}

function expense(accountId: string, patch: Partial<EntryFields> = {}): EntryFields {
  return {
    kind: 'expense',
    description: 'Aluguel',
    amountCents: -200000,
    accountId,
    toAccountId: null,
    categoryId: null,
    pot: 'essential',
    tags: ['casa'],
    startMonth: '2026-12',
    day: 10,
    recurrence: 'monthly',
    repeatEvery: 1,
    monthBy: 'day',
    installments: null,
    endMonth: null,
    parts: [],
    ...patch,
  }
}

async function entryRows(scope: Scope) {
  return db()
    .select()
    .from(entries)
    .where(eq(entries.spaceId, scope.spaceId))
    .orderBy(entries.startMonth)
}

async function overrideRows(entryId: string) {
  return db().select().from(entryOverrides).where(eq(entryOverrides.entryId, entryId))
}

async function expenseByMonth(scope: Scope): Promise<Record<string, number>> {
  const { months } = await projectLedger(scope, { from: '2026-12', to: '2027-04' })
  return Object.fromEntries(months.map((m) => [m.month, m.totals.expenseCents]))
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
  anaScope = await personalScope(db(), ANA)
  biaScope = await personalScope(db(), BIA)
  ana = await setupUser(anaScope)
  bia = await setupUser(biaScope)
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
    await expect(createEntry(anaScope, id, fields)).resolves.toMatchObject({ ok: true })
    await expect(createEntry(anaScope, id, fields)).resolves.toMatchObject({ ok: true })
    expect(await entryRows(anaScope)).toHaveLength(1)
    const parts = await db().select().from(entryParts).where(eq(entryParts.entryId, id))
    expect(parts.map((p) => [p.label, p.bps, p.sort])).toEqual([
      ['Adiantamento', 4000, 0],
      ['Saldo', 6000, 1],
    ])
  })

  it('refuses another user’s account and does not leak a replayed id', async () => {
    await expect(createEntry(biaScope, randomUUID(), expense(ana.accountId))).resolves.toEqual({
      ok: false,
      reason: 'invalid_reference',
    })
    const id = randomUUID()
    await createEntry(anaScope, id, expense(ana.accountId))
    await expect(createEntry(biaScope, id, expense(bia.accountId))).resolves.toEqual({
      ok: false,
      reason: 'not_found',
    })
    expect(await entryRows(biaScope)).toHaveLength(0)
  })
})

describe('updateEntry', () => {
  let id: string
  beforeEach(async () => {
    id = randomUUID()
    await createEntry(anaScope, id, expense(ana.accountId))
  })

  it('replaces every field of a whole-entry edit', async () => {
    const result = await updateEntry(
      anaScope,
      id,
      expense(ana.accountId, {
        description: 'Aluguel novo',
        amountCents: -210000,
        startMonth: '2027-01',
      }),
      null,
    )
    expect(result).toMatchObject({ ok: true })
    const [row] = await entryRows(anaScope)
    expect(row).toMatchObject({
      description: 'Aluguel novo',
      amountCents: -210000,
      startMonth: '2027-01-01',
    })
  })

  it('needs a scope when an occurrence amount changes', async () => {
    await expect(
      updateEntry(
        anaScope,
        id,
        expense(ana.accountId, { amountCents: -250000, startMonth: '2027-02' }),
        {
          month: '2027-02',
          scope: null,
        },
      ),
    ).resolves.toEqual({ ok: false, reason: 'scope_required' })
  })

  describe('a new split on an occurrence', () => {
    const split: EntryFields['parts'] = [
      { label: 'Adiantamento', bps: 4000, day: 15, nextMonth: false },
      { label: 'Saldo', bps: 6000, day: 30, nextMonth: false },
    ]
    const withSplit = () => expense(ana.accountId, { startMonth: '2027-02', day: 15, parts: split })
    const partsOf = (entryId: string) =>
      db().select().from(entryParts).where(eq(entryParts.entryId, entryId)).orderBy(entryParts.sort)

    it('needs a scope, and a series scope', async () => {
      await expect(
        updateEntry(anaScope, id, withSplit(), { month: '2027-02', scope: null }),
      ).resolves.toEqual({ ok: false, reason: 'scope_required' })
      await expect(
        updateEntry(anaScope, id, withSplit(), { month: '2027-02', scope: 'one' }),
      ).resolves.toEqual({ ok: false, reason: 'split_needs_series' })
      expect(await partsOf(id)).toEqual([])
    })

    it('"future" splits only the new series; earlier months stay whole', async () => {
      await expect(
        updateEntry(anaScope, id, withSplit(), { month: '2027-02', scope: 'future' }),
      ).resolves.toMatchObject({ ok: true })
      const [before, after] = await entryRows(anaScope)
      if (before === undefined || after === undefined) throw new Error('expected a split')
      expect([before.id, before.endMonth, before.day]).toEqual([id, '2027-01-01', 10])
      expect([after.startMonth, after.day]).toEqual(['2027-02-01', 15])
      expect(await partsOf(id)).toEqual([])
      expect((await partsOf(after.id)).map((p) => [p.label, p.bps, p.day])).toEqual([
        ['Adiantamento', 4000, 15],
        ['Saldo', 6000, 30],
      ])
    })

    it('"all" splits the whole series', async () => {
      await expect(
        updateEntry(anaScope, id, withSplit(), { month: '2027-02', scope: 'all' }),
      ).resolves.toMatchObject({ ok: true })
      const rows = await entryRows(anaScope)
      expect(rows.map((r) => [r.id, r.startMonth, r.day])).toEqual([[id, '2026-12-01', 15]])
      expect(await partsOf(id)).toHaveLength(2)
    })
  })

  it('applies series fields without a scope when amount and day are unchanged', async () => {
    await expect(
      updateEntry(
        anaScope,
        id,
        expense(ana.accountId, { description: 'Moradia', tags: [], startMonth: '2027-02' }),
        {
          month: '2027-02',
          scope: null,
        },
      ),
    ).resolves.toMatchObject({ ok: true })
    const [row] = await entryRows(anaScope)
    expect(row).toMatchObject({ description: 'Moradia', tags: [], startMonth: '2026-12-01' })
  })

  it('moves the start of the repetition when the date goes to another month', async () => {
    // The first occurrence (dez/26) moved to nov/26: the repetition starts a month earlier.
    await expect(
      updateEntry(anaScope, id, expense(ana.accountId, { startMonth: '2026-11' }), {
        month: '2026-12',
        scope: null,
      }),
    ).resolves.toMatchObject({ ok: true })
    const [row] = await entryRows(anaScope)
    expect(row).toMatchObject({ startMonth: '2026-11-01', endMonth: null, day: 10 })
    // A later occurrence moved forward shifts the start by as many months.
    await updateEntry(anaScope, id, expense(ana.accountId, { startMonth: '2027-04' }), {
      month: '2027-02',
      scope: null,
    })
    expect((await entryRows(anaScope))[0]?.startMonth).toBe('2027-01-01')
  })

  it('refuses to move the repetition past its end', async () => {
    await expect(
      updateEntry(
        anaScope,
        id,
        expense(ana.accountId, { startMonth: '2027-06', endMonth: '2027-02' }),
        {
          month: '2026-12',
          scope: null,
        },
      ),
    ).resolves.toEqual({ ok: false, reason: 'no_occurrence' })
    expect((await entryRows(anaScope))[0]?.startMonth).toBe('2026-12-01')
  })

  it('"one" writes an override for that month only', async () => {
    await updateEntry(
      anaScope,
      id,
      expense(ana.accountId, { amountCents: -250000, startMonth: '2027-02' }),
      {
        month: '2027-02',
        scope: 'one',
      },
    )
    expect(await expenseByMonth(anaScope)).toMatchObject({
      '2027-01': 200000,
      '2027-02': 250000,
      '2027-03': 200000,
    })
  })

  it('re-signs the series and its overrides when the kind changes direction', async () => {
    await updateEntry(
      anaScope,
      id,
      expense(ana.accountId, { amountCents: -250000, startMonth: '2027-02' }),
      { month: '2027-02', scope: 'one' },
    )
    const income = { kind: 'income' as const, pot: null, startMonth: '2027-01' }
    await updateEntry(anaScope, id, expense(ana.accountId, { ...income, amountCents: 200000 }), {
      month: '2027-01',
      scope: null,
    })
    const [row] = await entryRows(anaScope)
    expect(row).toMatchObject({ kind: 'income', amountCents: 200000 })
    expect((await overrideRows(id)).map((o) => o.amountCents)).toEqual([250000])
    // A transfer always leaves its source: a positive amount turns negative.
    await updateEntry(
      anaScope,
      id,
      expense(ana.accountId, {
        kind: 'transfer',
        pot: null,
        toAccountId: ana.otherAccountId,
        amountCents: -200000,
      }),
      null,
    )
    expect((await overrideRows(id)).map((o) => o.amountCents)).toEqual([-250000])
  })

  it('"future" splits the series inside one transaction', async () => {
    await updateEntry(
      anaScope,
      id,
      expense(ana.accountId, { amountCents: -250000, startMonth: '2027-02' }),
      {
        month: '2027-02',
        scope: 'one',
      },
    )
    await updateEntry(
      anaScope,
      id,
      expense(ana.accountId, { amountCents: -300000, day: 12, startMonth: '2027-03' }),
      {
        month: '2027-03',
        scope: 'future',
      },
    )
    const rows = await entryRows(anaScope)
    expect(rows.map((r) => [r.startMonth, r.endMonth, r.amountCents, r.day])).toEqual([
      ['2026-12-01', '2027-02-01', -200000, 10],
      ['2027-03-01', null, -300000, 12],
    ])
    expect(await overrideRows(id)).toHaveLength(1)
    expect(await expenseByMonth(anaScope)).toEqual({
      '2026-12': 200000,
      '2027-01': 200000,
      '2027-02': 250000,
      '2027-03': 300000,
      '2027-04': 300000,
    })
  })

  it('"all" edits the series and clears the patched field from overrides', async () => {
    await updateEntry(
      anaScope,
      id,
      expense(ana.accountId, { amountCents: -250000, startMonth: '2027-02' }),
      {
        month: '2027-02',
        scope: 'one',
      },
    )
    await updateEntry(
      anaScope,
      id,
      expense(ana.accountId, { amountCents: -220000, startMonth: '2027-01' }),
      {
        month: '2027-01',
        scope: 'all',
      },
    )
    expect(await overrideRows(id)).toHaveLength(0)
    expect(Object.values(await expenseByMonth(anaScope))).toEqual([
      220000, 220000, 220000, 220000, 220000,
    ])
  })

  it('rolls back the whole edit when it fails midway', async () => {
    const result = await updateEntry(
      anaScope,
      id,
      expense(ana.accountId, { amountCents: -300000, endMonth: '2027-01', startMonth: '2027-03' }),
      { month: '2027-03', scope: 'future' },
    )
    expect(result).toEqual({ ok: false, reason: 'no_occurrence' })
    const [row] = await entryRows(anaScope)
    expect(row).toMatchObject({ amountCents: -200000, endMonth: null })
  })

  it('is a no-op for another user', async () => {
    await expect(
      updateEntry(biaScope, id, expense(bia.accountId, { description: 'Hack' }), null),
    ).resolves.toEqual({ ok: false, reason: 'not_found' })
    const [row] = await entryRows(anaScope)
    expect(row?.description).toBe('Aluguel')
  })

  it('refuses moving the entry to another user’s account', async () => {
    await expect(updateEntry(anaScope, id, expense(bia.accountId), null)).resolves.toEqual({
      ok: false,
      reason: 'invalid_reference',
    })
  })
})

describe('repetition rule', () => {
  it('stores every N months on a weekday, and the database refuses a rule on the wrong recurrence', async () => {
    const id = randomUUID()
    await expect(
      createEntry(anaScope, id, expense(ana.accountId, { repeatEvery: 2, monthBy: 'weekday' })),
    ).resolves.toMatchObject({ ok: true })
    const [row] = await entryRows(anaScope)
    expect(row).toMatchObject({ repeatEvery: 2, monthBy: 'weekday' })
    await expect(
      db().update(entries).set({ recurrence: 'none' }).where(eq(entries.id, id)),
    ).rejects.toThrow()
  })
})

describe('changeOccurrenceDay', () => {
  it('moves a one-off entry and scopes a recurring one', async () => {
    const once = randomUUID()
    const monthly = randomUUID()
    await createEntry(anaScope, once, expense(ana.accountId, { recurrence: 'none' }))
    await createEntry(anaScope, monthly, expense(ana.accountId))
    await expect(
      changeOccurrenceDay(anaScope, { entryId: once, month: '2026-12', day: 3, scope: null }),
    ).resolves.toMatchObject({ ok: true })
    await expect(
      changeOccurrenceDay(anaScope, { entryId: monthly, month: '2027-01', day: 3, scope: null }),
    ).resolves.toEqual({ ok: false, reason: 'scope_required' })
    await expect(
      changeOccurrenceDay(anaScope, { entryId: monthly, month: '2027-01', day: 3, scope: 'one' }),
    ).resolves.toMatchObject({ ok: true })
    await expect(
      changeOccurrenceDay(anaScope, { entryId: monthly, month: '2027-01', day: 3, scope: null }),
    ).resolves.toMatchObject({ ok: true })
    const [override] = await overrideRows(monthly)
    expect(override).toMatchObject({ month: '2027-01-01', day: 3 })
    await expect(
      changeOccurrenceDay(biaScope, { entryId: monthly, month: '2027-01', day: 9, scope: 'all' }),
    ).resolves.toEqual({ ok: false, reason: 'not_found' })
    await expect(
      changeOccurrenceDay(anaScope, { entryId: once, month: '2027-05', day: 9, scope: null }),
    ).resolves.toEqual({ ok: false, reason: 'no_occurrence' })
  })
})

describe('deleteEntry', () => {
  let id: string
  beforeEach(async () => {
    id = randomUUID()
    await createEntry(anaScope, id, expense(ana.accountId))
  })

  it('"one" deletes that occurrence (skipped and never shown)', async () => {
    await deleteEntry(anaScope, id, { month: '2027-01', scope: 'one' })
    await deleteEntry(anaScope, id, { month: '2027-01', scope: 'one' })
    expect(await expenseByMonth(anaScope)).toMatchObject({ '2027-01': 0, '2027-02': 200000 })
    expect(await overrideRows(id)).toEqual([
      expect.objectContaining({ month: '2027-01-01', skipped: true, deleted: true }),
    ])
  })

  it('refuses a deleted occurrence that is not skipped', async () => {
    const insert = db()
      .insert(entryOverrides)
      .values({ entryId: id, ...anaScope, month: '2027-01-01', skipped: false, deleted: true })
    const error = await insert.then(
      () => null,
      (err: unknown) => pgErrorOf(err),
    )
    expect(error?.constraint).toBe('entry_overrides_deleted_is_skipped')
  })

  it('"future" ends the series before the month', async () => {
    await updateEntry(
      anaScope,
      id,
      expense(ana.accountId, { amountCents: -1, startMonth: '2027-03' }),
      {
        month: '2027-03',
        scope: 'one',
      },
    )
    await deleteEntry(anaScope, id, { month: '2027-02', scope: 'future' })
    const [row] = await entryRows(anaScope)
    expect(row?.endMonth).toBe('2027-01-01')
    expect(await overrideRows(id)).toHaveLength(0)
  })

  it('"future" keeps the installments already due', async () => {
    const inst = randomUUID()
    await createEntry(
      anaScope,
      inst,
      expense(ana.accountId, { recurrence: 'installments', installments: 12 }),
    )
    await deleteEntry(anaScope, inst, { month: '2027-03', scope: 'future' })
    const [row] = await db().select().from(entries).where(eq(entries.id, inst))
    expect(row?.installments).toBe(3)
    // 200000 in 12x: 16674 + 11 × 16666; the 3 kept keep their share of the total.
    expect(row?.amountCents).toBe(-(200000 - 16666 * 9))
  })

  it('"future" from the first month and "all" delete the entry', async () => {
    await deleteEntry(anaScope, id, { month: '2026-12', scope: 'future' })
    expect(await entryRows(anaScope)).toHaveLength(0)
    const other = randomUUID()
    await createEntry(anaScope, other, expense(ana.accountId))
    await deleteEntry(anaScope, other, { month: '2027-02', scope: 'all' })
    expect(await entryRows(anaScope)).toHaveLength(0)
  })

  it('is a no-op for another user', async () => {
    await expect(deleteEntry(biaScope, id, null)).resolves.toEqual({
      ok: false,
      reason: 'not_found',
    })
    await expect(deleteEntry(biaScope, id, { month: '2027-01', scope: 'one' })).resolves.toEqual({
      ok: false,
      reason: 'not_found',
    })
    expect(await entryRows(anaScope)).toHaveLength(1)
    await expect(deleteEntry(anaScope, id, { month: '2026-10', scope: 'one' })).resolves.toEqual({
      ok: false,
      reason: 'no_occurrence',
    })
  })
})

describe('banks and accounts', () => {
  it('creates idempotently and updates only the owner’s rows', async () => {
    const bankId = randomUUID()
    await createBank(anaScope, { id: bankId, name: 'Nubank' })
    await createBank(anaScope, { id: bankId, name: 'Nubank' })
    expect((await listBanks(anaScope)).map((b) => [b.name, b.sort])).toEqual([
      ['BTG', 0],
      ['Nubank', 1],
    ])
    await expect(updateBank(biaScope, { id: bankId, name: 'Hack' })).resolves.toEqual({
      ok: false,
      reason: 'not_found',
    })
    await expect(updateBank(anaScope, { id: bankId, name: 'Nu' })).resolves.toMatchObject({
      ok: true,
    })

    await expect(
      createAccount(biaScope, {
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
    await expect(updateAccount(biaScope, { ...base, archived: true })).resolves.toEqual({
      ok: false,
      reason: 'not_found',
    })
    await updateAccount(anaScope, { ...base, archived: true })
    const [first] = await db().select().from(accounts).where(eq(accounts.id, ana.accountId))
    await updateAccount(anaScope, { ...base, archived: true })
    const [second] = await db().select().from(accounts).where(eq(accounts.id, ana.accountId))
    expect(second?.archivedAt).toEqual(first?.archivedAt)
    await updateAccount(anaScope, { ...base, archived: false })
    const listed = (await listAccounts(anaScope)).find((a) => a.id === ana.accountId)
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
  it('sets count_from_month per user', async () => {
    await setCountFrom(anaScope, '2027-03')
    await expect(getCountFrom(anaScope)).resolves.toBe('2027-03')
    await expect(getCountFrom(biaScope)).resolves.toBe('2026-12')
  })
})
