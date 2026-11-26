import { fluxiDb, personalScope, seedUser, truncateFluxiTables } from '@/db'
import { categories, entries } from '@/db/schema'
import type { Scope } from '@/features/spaces/core/space'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createBudgetGroup,
  deleteBudgetVersion,
  removeBudgetGroup,
  saveBudgetVersion,
  updateBudgetGroup,
} from './budget.write'
import { listBudgetGroups, listBudgetVersions } from './ledger.repo'
import { createAccount, createBank, createEntry } from './ledger.write'

const ANA = '11111111-1111-4111-8111-111111111111'
const BIA = '22222222-2222-4222-8222-222222222222'

let anaScope: Scope
let biaScope: Scope

const db = () => fluxiDb.db()

beforeAll(async () => {
  await fluxiDb.migrate()
})

beforeEach(async () => {
  await truncateFluxiTables(db())
  await seedUser(db(), { id: ANA, email: 'ana@example.com' })
  await seedUser(db(), { id: BIA, email: 'bia@example.com' })
  anaScope = await personalScope(db(), ANA)
  biaScope = await personalScope(db(), BIA)
})

afterAll(async () => {
  await fluxiDb.close()
})

async function anaEntry(budgetGroup: string): Promise<{ ok: boolean }> {
  const bankId = randomUUID()
  const accountId = randomUUID()
  await createBank(anaScope, { id: bankId, name: 'BTG' })
  await createAccount(anaScope, {
    id: accountId,
    bankId,
    name: 'Conta',
    type: 'checking',
    openingBalanceCents: 0,
  })
  return createEntry(anaScope, randomUUID(), {
    kind: 'expense',
    description: 'Passagem',
    amountCents: -10000,
    accountId,
    toAccountId: null,
    categoryId: null,
    budgetGroup,
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

describe('budgetGroups', () => {
  it('creates a budget group at the end of the list, only for the user', async () => {
    const created = await createBudgetGroup(anaScope, { name: 'Viagens', color: 'sky' })
    expect(created.ok).toBe(true)
    const budgetGroups = await listBudgetGroups(anaScope)
    expect(budgetGroups.at(-1)).toMatchObject({
      key: created.key,
      name: 'Viagens',
      color: 'sky',
      goal: 'limit',
      sort: 6,
      archived: false,
    })
    await expect(listBudgetGroups(biaScope)).resolves.toHaveLength(6)
  })

  it('renames, recolors and changes the goal; never another user’s budget group', async () => {
    await expect(
      updateBudgetGroup(anaScope, {
        key: 'comfort',
        name: 'Lazer',
        color: 'teal',
        goal: 'minimum',
      }),
    ).resolves.toEqual({ ok: true })
    expect((await listBudgetGroups(anaScope)).find((p) => p.key === 'comfort')).toMatchObject({
      name: 'Lazer',
      color: 'teal',
      goal: 'minimum',
    })
    expect((await listBudgetGroups(biaScope)).find((p) => p.key === 'comfort')?.name).toBe(
      'Conforto',
    )
    await expect(updateBudgetGroup(anaScope, { key: 'p_missing', name: 'X' })).resolves.toEqual({
      ok: false,
      reason: 'not_found',
    })
  })

  it('deletes an unused budget group but archives one with history, which can come back', async () => {
    const { key } = await createBudgetGroup(anaScope, { name: 'Viagens', color: 'sky' })
    if (key === undefined) throw new Error('no key')
    await expect(removeBudgetGroup(anaScope, key)).resolves.toEqual({
      ok: true,
      outcome: 'deleted',
    })
    expect((await listBudgetGroups(anaScope)).some((p) => p.key === key)).toBe(false)

    // "Essencial" is the default budget group of seeded categories: archived, not deleted.
    await expect(removeBudgetGroup(anaScope, 'essential')).resolves.toEqual({
      ok: true,
      outcome: 'archived',
    })
    expect((await listBudgetGroups(anaScope)).find((p) => p.key === 'essential')?.archived).toBe(
      true,
    )
    await updateBudgetGroup(anaScope, { key: 'essential', archived: false })
    expect((await listBudgetGroups(anaScope)).find((p) => p.key === 'essential')?.archived).toBe(
      false,
    )

    await expect(removeBudgetGroup(biaScope, key)).resolves.toEqual({
      ok: false,
      reason: 'not_found',
    })
  })

  it('archives a budget group that only entries use', async () => {
    const { key } = await createBudgetGroup(anaScope, { name: 'Viagens', color: 'sky' })
    if (key === undefined) throw new Error('no key')
    await expect(anaEntry(key)).resolves.toMatchObject({ ok: true })
    await expect(removeBudgetGroup(anaScope, key)).resolves.toEqual({
      ok: true,
      outcome: 'archived',
    })
    const [row] = await db().select().from(entries).where(eq(entries.userId, ANA))
    expect(row?.budgetGroup).toBe(key)
  })

  it('refuses an entry or a category pointing at another user’s budget group', async () => {
    const { key } = await createBudgetGroup(biaScope, { name: 'Da Bia', color: 'sky' })
    if (key === undefined) throw new Error('no key')
    await expect(anaEntry(key)).resolves.toMatchObject({ ok: false, reason: 'invalid_reference' })
    await expect(
      db()
        .insert(categories)
        .values({ ...anaScope, groupName: 'X', name: 'Y', defaultBudgetGroup: key }),
    ).rejects.toThrow()
  })
})

describe('budget versions', () => {
  it('starts every user with one version holding the default targets', async () => {
    const [version] = await listBudgetVersions(anaScope)
    expect(version?.targets.essential).toBe(3300)
  })

  it('creates a version from a month and edits its targets, within 100%', async () => {
    const created = await saveBudgetVersion(anaScope, {
      id: null,
      startsMonth: '2027-03',
      targets: { essential: 4000, investment: 2000, comfort: 0 },
    })
    expect(created.ok).toBe(true)
    let versions = await listBudgetVersions(anaScope)
    expect(versions.map((p) => p.startsMonth)).toHaveLength(2)
    expect(versions.at(-1)).toMatchObject({
      startsMonth: '2027-03',
      targets: { essential: 4000, investment: 2000 },
    })

    await expect(
      saveBudgetVersion(anaScope, {
        id: created.id ?? null,
        startsMonth: '2027-04',
        targets: { essential: 5000 },
      }),
    ).resolves.toMatchObject({ ok: true })
    versions = await listBudgetVersions(anaScope)
    expect(versions.at(-1)).toMatchObject({ startsMonth: '2027-04', targets: { essential: 5000 } })

    await expect(
      saveBudgetVersion(anaScope, {
        id: null,
        startsMonth: '2027-05',
        targets: { a: 6000, b: 5000 },
      }),
    ).resolves.toEqual({ ok: false, reason: 'over_budget' })
    await expect(listBudgetVersions(biaScope)).resolves.toHaveLength(1)
  })

  it('refuses two versions starting in the same month and targets of unknown budget groups', async () => {
    const [first] = await listBudgetVersions(anaScope)
    if (first === undefined) throw new Error('no version')
    await expect(
      saveBudgetVersion(anaScope, { id: null, startsMonth: first.startsMonth, targets: {} }),
    ).resolves.toEqual({ ok: false, reason: 'duplicate_version' })
    const { key } = await createBudgetGroup(biaScope, { name: 'Da Bia', color: 'sky' })
    await expect(
      saveBudgetVersion(anaScope, {
        id: null,
        startsMonth: '2030-01',
        targets: { [key ?? '']: 100 },
      }),
    ).resolves.toEqual({ ok: false, reason: 'invalid_reference' })
    await expect(
      saveBudgetVersion(biaScope, { id: first.id, startsMonth: '2030-01', targets: {} }),
    ).resolves.toEqual({ ok: false, reason: 'not_found' })
  })

  it('deletes a version but never the last one', async () => {
    const [first] = await listBudgetVersions(anaScope)
    if (first === undefined) throw new Error('no version')
    await expect(deleteBudgetVersion(anaScope, first.id)).resolves.toEqual({
      ok: false,
      reason: 'last_version',
    })
    const created = await saveBudgetVersion(anaScope, {
      id: null,
      startsMonth: '2030-01',
      targets: {},
    })
    await expect(deleteBudgetVersion(biaScope, created.id ?? '')).resolves.toEqual({
      ok: false,
      reason: 'not_found',
    })
    await expect(deleteBudgetVersion(anaScope, first.id)).resolves.toEqual({ ok: true })
    await expect(listBudgetVersions(anaScope)).resolves.toHaveLength(1)
  })

  it('drops a deleted budget group from every version', async () => {
    const { key } = await createBudgetGroup(anaScope, { name: 'Viagens', color: 'sky' })
    if (key === undefined) throw new Error('no key')
    const [version] = await listBudgetVersions(anaScope)
    if (version === undefined) throw new Error('no version')
    await saveBudgetVersion(anaScope, {
      id: version.id,
      startsMonth: version.startsMonth,
      targets: { ...version.targets, essential: 2300, [key]: 1000 },
    })
    await removeBudgetGroup(anaScope, key)
    const [after] = await listBudgetVersions(anaScope)
    expect(after?.targets[key]).toBeUndefined()
  })
})
