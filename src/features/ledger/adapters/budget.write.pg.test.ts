import { fluxiDb, seedUser, truncateFluxiTables } from '@/db'
import { categories, entries } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createPot, deleteBudgetPlan, removePot, saveBudgetPlan, updatePot } from './budget.write'
import { listBudgetPlans, listPots } from './ledger.repo'
import { createAccount, createBank, createEntry } from './ledger.write'

const ANA = '11111111-1111-4111-8111-111111111111'
const BIA = '22222222-2222-4222-8222-222222222222'

const db = () => fluxiDb.db()

beforeAll(async () => {
  await fluxiDb.migrate()
})

beforeEach(async () => {
  await truncateFluxiTables(db())
  await seedUser(db(), { id: ANA, email: 'ana@example.com' })
  await seedUser(db(), { id: BIA, email: 'bia@example.com' })
})

afterAll(async () => {
  await fluxiDb.close()
})

async function anaEntry(pot: string): Promise<{ ok: boolean }> {
  const bankId = randomUUID()
  const accountId = randomUUID()
  await createBank(ANA, { id: bankId, name: 'BTG' })
  await createAccount(ANA, {
    id: accountId,
    bankId,
    name: 'Conta',
    type: 'checking',
    openingBalanceCents: 0,
  })
  return createEntry(ANA, randomUUID(), {
    kind: 'expense',
    description: 'Passagem',
    amountCents: 10000,
    accountId,
    toAccountId: null,
    categoryId: null,
    pot,
    tags: [],
    startMonth: '2026-12',
    day: 10,
    recurrence: 'none',
    repeatEvery: 1,
    monthBy: 'day',
    installments: null,
    endMonth: null,
    parts: [],
  })
}

describe('pots', () => {
  it('creates a pot at the end of the list, only for the user', async () => {
    const created = await createPot(ANA, { name: 'Viagens', color: 'sky' })
    expect(created.ok).toBe(true)
    const pots = await listPots(ANA)
    expect(pots.at(-1)).toMatchObject({
      key: created.key,
      name: 'Viagens',
      color: 'sky',
      goal: 'limit',
      sort: 6,
      archived: false,
    })
    await expect(listPots(BIA)).resolves.toHaveLength(6)
  })

  it('renames, recolors and changes the goal; never another user’s pot', async () => {
    await expect(
      updatePot(ANA, { key: 'comfort', name: 'Lazer', color: 'teal', goal: 'minimum' }),
    ).resolves.toEqual({ ok: true })
    expect((await listPots(ANA)).find((p) => p.key === 'comfort')).toMatchObject({
      name: 'Lazer',
      color: 'teal',
      goal: 'minimum',
    })
    expect((await listPots(BIA)).find((p) => p.key === 'comfort')?.name).toBe('Conforto')
    await expect(updatePot(ANA, { key: 'p_missing', name: 'X' })).resolves.toEqual({
      ok: false,
      reason: 'not_found',
    })
  })

  it('deletes an unused pot but archives one with history, which can come back', async () => {
    const { key } = await createPot(ANA, { name: 'Viagens', color: 'sky' })
    if (key === undefined) throw new Error('no key')
    await expect(removePot(ANA, key)).resolves.toEqual({ ok: true, outcome: 'deleted' })
    expect((await listPots(ANA)).some((p) => p.key === key)).toBe(false)

    // "Essencial" is the default pot of seeded categories: archived, not deleted.
    await expect(removePot(ANA, 'essential')).resolves.toEqual({ ok: true, outcome: 'archived' })
    expect((await listPots(ANA)).find((p) => p.key === 'essential')?.archived).toBe(true)
    await updatePot(ANA, { key: 'essential', archived: false })
    expect((await listPots(ANA)).find((p) => p.key === 'essential')?.archived).toBe(false)

    await expect(removePot(BIA, key)).resolves.toEqual({ ok: false, reason: 'not_found' })
  })

  it('archives a pot that only entries use', async () => {
    const { key } = await createPot(ANA, { name: 'Viagens', color: 'sky' })
    if (key === undefined) throw new Error('no key')
    await expect(anaEntry(key)).resolves.toMatchObject({ ok: true })
    await expect(removePot(ANA, key)).resolves.toEqual({ ok: true, outcome: 'archived' })
    const [row] = await db().select().from(entries).where(eq(entries.userId, ANA))
    expect(row?.pot).toBe(key)
  })

  it('refuses an entry or a category pointing at another user’s pot', async () => {
    const { key } = await createPot(BIA, { name: 'Da Bia', color: 'sky' })
    if (key === undefined) throw new Error('no key')
    await expect(anaEntry(key)).resolves.toMatchObject({ ok: false, reason: 'invalid_reference' })
    await expect(
      db().insert(categories).values({ userId: ANA, groupName: 'X', name: 'Y', defaultPot: key }),
    ).rejects.toThrow()
  })
})

describe('budget versions', () => {
  it('starts every user with one version holding the default targets', async () => {
    const [plan] = await listBudgetPlans(ANA)
    expect(plan?.targets.essential).toBe(3300)
  })

  it('creates a version from a month and edits its targets, within 100%', async () => {
    const created = await saveBudgetPlan(ANA, {
      id: null,
      startsMonth: '2027-03',
      targets: { essential: 4000, investment: 2000, comfort: 0 },
    })
    expect(created.ok).toBe(true)
    let plans = await listBudgetPlans(ANA)
    expect(plans.map((p) => p.startsMonth)).toHaveLength(2)
    expect(plans.at(-1)).toMatchObject({
      startsMonth: '2027-03',
      targets: { essential: 4000, investment: 2000 },
    })

    await expect(
      saveBudgetPlan(ANA, {
        id: created.id ?? null,
        startsMonth: '2027-04',
        targets: { essential: 5000 },
      }),
    ).resolves.toMatchObject({ ok: true })
    plans = await listBudgetPlans(ANA)
    expect(plans.at(-1)).toMatchObject({ startsMonth: '2027-04', targets: { essential: 5000 } })

    await expect(
      saveBudgetPlan(ANA, { id: null, startsMonth: '2027-05', targets: { a: 6000, b: 5000 } }),
    ).resolves.toEqual({ ok: false, reason: 'over_budget' })
    await expect(listBudgetPlans(BIA)).resolves.toHaveLength(1)
  })

  it('refuses two versions starting in the same month and targets of unknown pots', async () => {
    const [first] = await listBudgetPlans(ANA)
    if (first === undefined) throw new Error('no plan')
    await expect(
      saveBudgetPlan(ANA, { id: null, startsMonth: first.startsMonth, targets: {} }),
    ).resolves.toEqual({ ok: false, reason: 'duplicate_plan' })
    const { key } = await createPot(BIA, { name: 'Da Bia', color: 'sky' })
    await expect(
      saveBudgetPlan(ANA, { id: null, startsMonth: '2030-01', targets: { [key ?? '']: 100 } }),
    ).resolves.toEqual({ ok: false, reason: 'invalid_reference' })
    await expect(
      saveBudgetPlan(BIA, { id: first.id, startsMonth: '2030-01', targets: {} }),
    ).resolves.toEqual({ ok: false, reason: 'not_found' })
  })

  it('deletes a version but never the last one', async () => {
    const [first] = await listBudgetPlans(ANA)
    if (first === undefined) throw new Error('no plan')
    await expect(deleteBudgetPlan(ANA, first.id)).resolves.toEqual({
      ok: false,
      reason: 'last_plan',
    })
    const created = await saveBudgetPlan(ANA, { id: null, startsMonth: '2030-01', targets: {} })
    await expect(deleteBudgetPlan(BIA, created.id ?? '')).resolves.toEqual({
      ok: false,
      reason: 'not_found',
    })
    await expect(deleteBudgetPlan(ANA, first.id)).resolves.toEqual({ ok: true })
    await expect(listBudgetPlans(ANA)).resolves.toHaveLength(1)
  })

  it('drops a deleted pot from every version', async () => {
    const { key } = await createPot(ANA, { name: 'Viagens', color: 'sky' })
    if (key === undefined) throw new Error('no key')
    const [plan] = await listBudgetPlans(ANA)
    if (plan === undefined) throw new Error('no plan')
    await saveBudgetPlan(ANA, {
      id: plan.id,
      startsMonth: plan.startsMonth,
      targets: { ...plan.targets, essential: 2300, [key]: 1000 },
    })
    await removePot(ANA, key)
    const [after] = await listBudgetPlans(ANA)
    expect(after?.targets[key]).toBeUndefined()
  })
})
