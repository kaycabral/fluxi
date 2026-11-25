import { fluxiDb, seedUser, truncateFluxiTables } from '@/db'
import {
  accounts,
  banks,
  categories,
  entries,
  entryOverrides,
  entryParts,
  importLinks,
  userSettings,
} from '@/db/schema'
import { DEFAULT_CATEGORY_GROUPS, DEFAULT_POTS } from '@/features/ledger/core/defaults'
import { pgErrorOf } from '@cbrl/pg'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  getCountFrom,
  listAccounts,
  listBanks,
  listBudgetPlans,
  listCategories,
  listEntries,
  listEntryOverrides,
  listEntryParts,
  listPots,
  listTags,
  loadLedger,
} from './ledger.repo'
import { projectLedger } from './projection'

const ANA = '11111111-1111-4111-8111-111111111111'
const BIA = '22222222-2222-4222-8222-222222222222'
const WINDOW = { from: '2026-12', to: '2027-02' }

type Fixture = { bankId: string; checkingId: string; savingsId: string; entryId: string }

const db = () => fluxiDb.db()

async function seedLedger(userId: string, salaryCents: number): Promise<Fixture> {
  const [bank] = await db().insert(banks).values({ userId, name: 'BTG' }).returning()
  if (bank === undefined) throw new Error('bank not inserted')
  const [checking, savings] = await db()
    .insert(accounts)
    .values([
      { userId, bankId: bank.id, name: 'Conta', type: 'checking', openingBalanceCents: 100000 },
      { userId, bankId: bank.id, name: 'Reserva', type: 'investment' },
    ])
    .returning()
  if (checking === undefined || savings === undefined) throw new Error('accounts not inserted')
  const [entry] = await db()
    .insert(entries)
    .values({
      userId,
      kind: 'income',
      description: 'Salário',
      amountCents: salaryCents,
      accountId: checking.id,
      startMonth: '2026-12-01',
      day: 5,
      recurrence: 'monthly',
      tags: ['trabalho'],
    })
    .returning()
  if (entry === undefined) throw new Error('entry not inserted')
  await db()
    .insert(entryParts)
    .values([
      { userId, entryId: entry.id, label: 'Adiantamento', bps: 4000, day: 20, sort: 0 },
      { userId, entryId: entry.id, label: 'Saldo', bps: 6000, day: 5, nextMonth: true, sort: 1 },
    ])
  await db()
    .insert(entryOverrides)
    .values({ userId, entryId: entry.id, month: '2027-01-01', skipped: true })
  await db().insert(entries).values({
    userId,
    kind: 'transfer',
    description: 'Reserva',
    amountCents: 10000,
    accountId: checking.id,
    toAccountId: savings.id,
    startMonth: '2026-12-01',
    day: 25,
    recurrence: 'monthly',
  })
  return { bankId: bank.id, checkingId: checking.id, savingsId: savings.id, entryId: entry.id }
}

async function rejection(
  promise: PromiseLike<unknown>,
): Promise<{ code?: string; constraint?: string }> {
  try {
    await promise
  } catch (err) {
    return pgErrorOf(err)
  }
  throw new Error('expected the statement to fail')
}

let ana: Fixture
let bia: Fixture

beforeAll(async () => {
  await fluxiDb.migrate()
})

beforeEach(async () => {
  await truncateFluxiTables(db())
  await seedUser(db(), { id: ANA, email: 'ana@example.com' })
  await seedUser(db(), { id: BIA, email: 'bia@example.com' })
  ana = await seedLedger(ANA, 1000000)
  bia = await seedLedger(BIA, 500000)
  await db()
    .update(userSettings)
    .set({ countFromMonth: '2026-12-01' })
    .where(sql`${userSettings.userId} = ${ANA}`)
})

afterAll(async () => {
  await fluxiDb.close()
})

describe('default seeding (auth trigger)', () => {
  it('gives every new user the default pots, a first budget version, categories and settings', async () => {
    await expect(listPots(BIA)).resolves.toEqual(
      DEFAULT_POTS.map(({ key, name, color, goal }, sort) => ({
        key,
        name,
        color,
        goal,
        sort,
        archived: false,
      })),
    )
    const plans = await listBudgetPlans(BIA)
    expect(plans).toHaveLength(1)
    expect(plans[0]?.targets).toEqual(
      Object.fromEntries(DEFAULT_POTS.map((p) => [p.key, p.targetBps])),
    )
    const expected = DEFAULT_CATEGORY_GROUPS.flatMap((g) =>
      g.names.map((name) => ({
        groupName: g.group,
        name,
        defaultPot: g.defaultPot,
        archived: false,
      })),
    )
    const seeded = await listCategories(BIA)
    expect(seeded.map(({ id: _id, ...rest }) => rest)).toEqual(expected)
    await expect(getCountFrom(BIA)).resolves.toBeNull()
  })

  it('is idempotent and per user', async () => {
    await db().execute(sql`select public.seed_ledger_defaults(${BIA}::uuid)`)
    await db().execute(sql`select public.seed_budget_defaults(${BIA}::uuid)`)
    await expect(listPots(BIA)).resolves.toHaveLength(DEFAULT_POTS.length)
    await expect(listBudgetPlans(BIA)).resolves.toHaveLength(1)
    const [ana, bia] = await Promise.all([listCategories(ANA), listCategories(BIA)])
    expect(bia).toHaveLength(ana.length)
    expect(new Set([...ana, ...bia].map((c) => c.id)).size).toBe(ana.length * 2)
  })

  it('is not callable through the public API roles', async () => {
    const error = await rejection(
      db().transaction(async (tx) => {
        await tx.execute(sql`set local role authenticated`)
        await tx.execute(sql`select public.seed_ledger_defaults(${BIA}::uuid)`)
      }),
    )
    expect(error.code).toBe('42501')
    const budget = await rejection(
      db().transaction(async (tx) => {
        await tx.execute(sql`set local role authenticated`)
        await tx.execute(sql`select public.seed_budget_defaults(${BIA}::uuid)`)
      }),
    )
    expect(budget.code).toBe('42501')
  })
})

describe('user isolation', () => {
  it('never returns another user’s rows from any query', async () => {
    const [anaLedger, biaLedger] = await Promise.all([
      loadLedger(ANA, WINDOW),
      loadLedger(BIA, WINDOW),
    ])
    const ids = (ledger: typeof anaLedger) =>
      new Set([
        ...ledger.banks.map((r) => r.id),
        ...ledger.accounts.map((r) => r.id),
        ...ledger.categories.map((r) => r.id),
        ...ledger.entries.map((r) => r.id),
        ...ledger.parts.map((r) => r.id),
      ])
    const biaIds = ids(biaLedger)
    expect([...ids(anaLedger)].filter((id) => biaIds.has(id))).toEqual([])

    expect(anaLedger.banks.map((b) => b.id)).toEqual([ana.bankId])
    expect(anaLedger.accounts.map((a) => a.id).sort()).toEqual(
      [ana.checkingId, ana.savingsId].sort(),
    )
    expect(anaLedger.entries.map((e) => e.amountCents).sort()).toEqual([10000, 1000000])
    expect(biaLedger.entries.map((e) => e.amountCents).sort()).toEqual([10000, 500000])
    expect(anaLedger.countFrom).toBe('2026-12')
    expect(biaLedger.countFrom).toBeNull()
  })

  it('lists each user’s own tags, distinct and sorted', async () => {
    await db()
      .insert(entries)
      .values({
        userId: ANA,
        kind: 'expense',
        description: 'Passagem',
        amountCents: 50000,
        accountId: ana.checkingId,
        startMonth: '2026-12-01',
        day: 10,
        recurrence: 'none',
        tags: ['viagem', 'Casamento', 'trabalho'],
      })
    await db()
      .update(entries)
      .set({ tags: ['só da Bia'] })
      .where(sql`${entries.userId} = ${BIA}`)
    expect(await listTags(ANA)).toEqual(['Casamento', 'trabalho', 'viagem'])
    expect(await listTags(BIA)).toEqual(['só da Bia'])
  })

  it('ignores foreign ids passed to the scoped queries', async () => {
    await expect(listEntryParts(ANA, [bia.entryId])).resolves.toEqual([])
    await expect(listEntryOverrides(ANA, [bia.entryId], WINDOW)).resolves.toEqual([])
    await expect(listEntryParts(ANA, [])).resolves.toEqual([])
    await expect(listEntryOverrides(ANA, [], WINDOW)).resolves.toEqual([])
    await expect(listBanks('33333333-3333-4333-8333-333333333333')).resolves.toEqual([])
    await expect(listAccounts('33333333-3333-4333-8333-333333333333')).resolves.toEqual([])
  })

  it('refuses rows that point at another user’s rows', async () => {
    const error = await rejection(
      db().insert(entries).values({
        userId: BIA,
        kind: 'expense',
        description: 'Invasão',
        amountCents: 100,
        accountId: ana.checkingId,
        startMonth: '2026-12-01',
        day: 1,
        recurrence: 'none',
      }),
    )
    expect(error).toEqual({ code: '23503', constraint: 'entries_account_fk' })
    const part = await rejection(
      db()
        .insert(entryParts)
        .values({ userId: BIA, entryId: ana.entryId, label: 'x', bps: 1, day: 1 }),
    )
    expect(part.constraint).toBe('entry_parts_entry_fk')
  })

  it('exposes nothing to the public API roles', async () => {
    const rows = await db().transaction(async (tx) => {
      await tx.execute(sql`set local role anon`)
      const result = await tx.execute(
        sql`select (select count(*) from entries) + (select count(*) from accounts) + (select count(*) from categories) as n`,
      )
      return result.rows
    })
    expect(rows).toEqual([{ n: '0' }])
  })

  it('cascades a user’s ledger away with the auth user, leaving others intact', async () => {
    await db().execute(sql`delete from auth.users where id = ${ANA}`)
    await expect(loadLedger(ANA, WINDOW)).resolves.toMatchObject({
      entries: [],
      accounts: [],
      pots: [],
    })
    await expect(listEntries(BIA, WINDOW)).resolves.toHaveLength(2)
  })
})

describe('loading a window', () => {
  it('maps rows to the core types with months and cents', async () => {
    const ledger = await loadLedger(ANA, WINDOW)
    expect(ledger.entries.find((e) => e.id === ana.entryId)).toEqual({
      id: ana.entryId,
      kind: 'income',
      description: 'Salário',
      amountCents: 1000000,
      accountId: ana.checkingId,
      toAccountId: null,
      categoryId: null,
      pot: null,
      tags: ['trabalho'],
      startMonth: '2026-12',
      day: 5,
      recurrence: 'monthly',
      repeatEvery: 1,
      monthBy: 'day',
      installments: null,
      endMonth: null,
    })
    expect(ledger.parts.map((p) => [p.label, p.bps, p.nextMonth])).toEqual([
      ['Adiantamento', 4000, false],
      ['Saldo', 6000, true],
    ])
    expect(ledger.overrides).toEqual([
      {
        entryId: ana.entryId,
        month: '2027-01',
        amountCents: null,
        day: null,
        skipped: true,
        deleted: false,
      },
    ])
  })

  it('leaves out entries that cannot land in the window', async () => {
    await db()
      .insert(entries)
      .values([
        {
          userId: ANA,
          kind: 'expense',
          description: 'Antiga',
          amountCents: 100,
          accountId: ana.checkingId,
          startMonth: '2026-01-01',
          day: 1,
          recurrence: 'monthly',
          endMonth: '2026-10-01',
        },
        {
          userId: ANA,
          kind: 'expense',
          description: 'Única antiga',
          amountCents: 100,
          accountId: ana.checkingId,
          startMonth: '2026-06-01',
          day: 1,
          recurrence: 'none',
        },
        {
          userId: ANA,
          kind: 'expense',
          description: 'Futura',
          amountCents: 100,
          accountId: ana.checkingId,
          startMonth: '2027-03-01',
          day: 1,
          recurrence: 'none',
        },
        {
          userId: ANA,
          kind: 'expense',
          description: 'Termina no mês anterior',
          amountCents: 100,
          accountId: ana.checkingId,
          startMonth: '2026-01-01',
          day: 1,
          recurrence: 'monthly',
          endMonth: '2026-11-01',
        },
      ])
    const descriptions = (await listEntries(ANA, WINDOW)).map((e) => e.description)
    expect(descriptions.sort()).toEqual(['Reserva', 'Salário', 'Termina no mês anterior'])
  })

  it('projects balances from count_from_month', async () => {
    const { months } = await projectLedger(ANA, { from: '2027-01', to: '2027-02' })
    expect(months.map((m) => m.month)).toEqual(['2027-01', '2027-02'])
    // Dec: +400000 advance, -10000 transfer. Jan (skipped): +600000 rest of Dec, -10000.
    expect(months[0]?.openingBalances).toEqual({ [ana.checkingId]: 490000, [ana.savingsId]: 10000 })
    expect(months[0]?.closingBalances).toEqual({
      [ana.checkingId]: 1080000,
      [ana.savingsId]: 20000,
    })
    expect(months[1]?.totals.incomeCents).toBe(400000)
  })

  it('projects from the window start without count_from_month', async () => {
    const { months } = await projectLedger(BIA, { from: '2027-02', to: '2027-02' })
    expect(months[0]?.openingBalances).toEqual({ [bia.checkingId]: 100000, [bia.savingsId]: 0 })
  })
})

describe('check constraints', () => {
  const base = () => ({
    userId: ANA,
    description: 'x',
    amountCents: 100,
    accountId: ana.checkingId,
    startMonth: '2026-12-01',
    day: 10,
  })

  it.each([
    [
      'transfer without destination',
      { kind: 'transfer', recurrence: 'none' },
      'entries_transfer_fields',
    ],
    [
      'income with a destination',
      { kind: 'income', recurrence: 'none', toAccount: true },
      'entries_transfer_fields',
    ],
    [
      'transfer with a pot',
      { kind: 'transfer', recurrence: 'none', toAccount: true, pot: 'essential' },
      'entries_pot_expense_only',
    ],
    [
      'income with a pot',
      { kind: 'income', recurrence: 'none', pot: 'essential' },
      'entries_pot_expense_only',
    ],
    [
      'installments without count',
      { kind: 'expense', recurrence: 'installments' },
      'entries_installments_valid',
    ],
    [
      'count without installments',
      { kind: 'expense', recurrence: 'monthly', installments: 3 },
      'entries_installments_valid',
    ],
    [
      'end month on a one-off',
      { kind: 'expense', recurrence: 'none', endMonth: '2027-01-01' },
      'entries_end_month_valid',
    ],
    [
      'end before start',
      { kind: 'expense', recurrence: 'monthly', endMonth: '2026-11-01' },
      'entries_end_month_valid',
    ],
    [
      'month not on the 1st',
      { kind: 'expense', recurrence: 'none', startMonth: '2026-12-15' },
      'entries_start_month_first_day',
    ],
    [
      'zero amount',
      { kind: 'expense', recurrence: 'none', amountCents: 0 },
      'entries_amount_positive',
    ],
    ['day 32', { kind: 'expense', recurrence: 'none', day: 32 }, 'entries_day_range'],
  ] as const)('rejects %s', async (_label, variant, constraint) => {
    const { toAccount, ...fields } = { toAccount: false, ...variant }
    const error = await rejection(
      db()
        .insert(entries)
        .values({ ...base(), ...fields, toAccountId: toAccount ? ana.savingsId : null }),
    )
    expect(error).toEqual({ code: '23514', constraint })
  })

  it('rejects a transfer to the same account', async () => {
    const error = await rejection(
      db()
        .insert(entries)
        .values({ ...base(), kind: 'transfer', recurrence: 'none', toAccountId: ana.checkingId }),
    )
    expect(error.constraint).toBe('entries_transfer_fields')
  })

  it('rejects invalid parts, overrides, pots and import links', async () => {
    const part = await rejection(
      db()
        .insert(entryParts)
        .values({ userId: ANA, entryId: ana.entryId, label: 'x', bps: 0, day: 1 }),
    )
    expect(part.constraint).toBe('entry_parts_bps_range')
    const override = await rejection(
      db()
        .insert(entryOverrides)
        .values({ userId: ANA, entryId: ana.entryId, month: '2027-02-01', amountCents: -5 }),
    )
    expect(override.constraint).toBe('entry_overrides_amount_positive')
    const pot = await rejection(
      db().execute(sql`update budget_plan_targets set target_bps = 10001 where user_id = ${ANA}`),
    )
    expect(pot.constraint).toBe('budget_plan_targets_bps_range')
    const link = await rejection(
      db().insert(importLinks).values({
        userId: ANA,
        source: 'notion',
        externalId: 'page-1',
        entryId: ana.entryId,
        month: '2027-02-02',
      }),
    )
    expect(link.constraint).toBe('import_links_month_first_day')
  })

  it('keeps category names unique per user but not across users', async () => {
    const duplicate = await rejection(
      db().insert(categories).values({ userId: ANA, groupName: 'Renda', name: 'Salário' }),
    )
    expect(duplicate).toEqual({ code: '23505', constraint: 'categories_user_group_name_unique' })
    await db().insert(categories).values({ userId: ANA, groupName: 'Renda', name: 'Freela' })
    await db().insert(categories).values({ userId: BIA, groupName: 'Renda', name: 'Freela' })
  })
})
