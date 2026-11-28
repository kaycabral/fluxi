import { fluxiDb, personalScope, seedUser, truncateFluxiTables } from '@/db'
import { accounts } from '@/db/schema'
import { ownerDb } from '@/db/test-database'
import type { GoalInput } from '@/features/goals/core/schemas'
import { createAccount, createBank } from '@/features/ledger/adapters/ledger.write'
import type { Scope } from '@/features/spaces/core/space'
import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { listGoals } from './goals.repo'
import { deleteGoal, saveGoal } from './goals.write'

const ANA = '11111111-1111-4111-8111-111111111111'
const BIA = '22222222-2222-4222-8222-222222222222'

let anaScope: Scope
let biaScope: Scope

const db = () => fluxiDb.db()

const TRIP: GoalInput = {
  id: null,
  name: 'Viagem',
  kind: 'recurring',
  budgetGroup: 'goals',
  targetCents: 1_200_000,
  targetMonth: '2027-04',
  monthlyCents: 100_000,
  initialCents: 50_000,
  withdrawalBps: 400,
  accountId: null,
}

async function anaAccount(): Promise<string> {
  const bankId = randomUUID()
  const accountId = randomUUID()
  await createBank(anaScope, { id: bankId, name: 'BTG' })
  await createAccount(anaScope, {
    id: accountId,
    bankId,
    name: 'Caixinha',
    type: 'investment',
    openingBalanceCents: 0,
  })
  return accountId
}

beforeEach(async () => {
  await truncateFluxiTables(ownerDb.db())
  await seedUser(ownerDb.db(), { id: ANA, email: 'ana@example.com' })
  await seedUser(ownerDb.db(), { id: BIA, email: 'bia@example.com' })
  anaScope = await personalScope(db(), ANA)
  biaScope = await personalScope(db(), BIA)
})

afterAll(async () => {
  await fluxiDb.close()
})

describe('goals', () => {
  it('creates in the seeded Metas group, edits and deletes only in its space', async () => {
    await expect(saveGoal(anaScope, TRIP, '2026-11')).resolves.toEqual({ ok: true })
    const [trip] = await listGoals(anaScope)
    expect(trip).toMatchObject({ name: 'Viagem', budgetGroup: 'goals', startMonth: '2026-11' })
    await expect(listGoals(biaScope)).resolves.toEqual([])
    const edit = { ...TRIP, id: trip!.id, monthlyCents: 120_000 }
    await expect(saveGoal(biaScope, edit, '2026-11')).resolves.toEqual({
      ok: false,
      reason: 'not_found',
    })
    await saveGoal(anaScope, edit, '2026-11')
    await expect(listGoals(anaScope)).resolves.toMatchObject([{ monthlyCents: 120_000 }])
    await expect(deleteGoal(biaScope, trip!.id)).resolves.toMatchObject({ ok: false })
    await expect(deleteGoal(anaScope, trip!.id)).resolves.toEqual({ ok: true })
  })

  it("refuses another space's account and forgets a deleted dedicated account", async () => {
    const accountId = await anaAccount()
    await expect(saveGoal(biaScope, { ...TRIP, accountId }, '2026-11')).resolves.toEqual({
      ok: false,
      reason: 'invalid_reference',
    })
    await saveGoal(anaScope, { ...TRIP, accountId }, '2026-11')
    await db().delete(accounts).where(eq(accounts.id, accountId))
    await expect(listGoals(anaScope)).resolves.toMatchObject([{ accountId: null }])
  })
})
