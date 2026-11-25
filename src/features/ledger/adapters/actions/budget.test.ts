import type { SessionUser } from '@cbrl/supabase'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createPotAction,
  deleteBudgetPlanAction,
  removePotAction,
  saveBudgetPlanAction,
  updatePotAction,
} from './budget'

type Result = { ok: true } | { ok: false; reason: string }
const write = {
  createPot: vi.fn<(...args: unknown[]) => Promise<Result>>(),
  updatePot: vi.fn<(...args: unknown[]) => Promise<Result>>(),
  removePot:
    vi.fn<
      (...args: unknown[]) => Promise<{ ok: true; outcome: 'deleted' | 'archived' } | Result>
    >(),
  saveBudgetPlan: vi.fn<(...args: unknown[]) => Promise<Result>>(),
  deleteBudgetPlan: vi.fn<(...args: unknown[]) => Promise<Result>>(),
}
const getServerUser = vi.fn<() => Promise<SessionUser | null>>()
const revalidatePath = vi.fn<(path: string, type?: string) => void>()

vi.mock('@/lib/auth/server', () => ({ getServerUser: () => getServerUser() }))
vi.mock('next/cache', () => ({
  revalidatePath: (path: string, type?: string) => revalidatePath(path, type),
}))
vi.mock('@/features/ledger/adapters/budget.write', () => ({
  createPot: (...a: unknown[]) => write.createPot(...a),
  updatePot: (...a: unknown[]) => write.updatePot(...a),
  removePot: (...a: unknown[]) => write.removePot(...a),
  saveBudgetPlan: (...a: unknown[]) => write.saveBudgetPlan(...a),
  deleteBudgetPlan: (...a: unknown[]) => write.deleteBudgetPlan(...a),
}))

const user: SessionUser = {
  id: 'session-user',
  email: 'ana@example.com',
  name: 'Ana',
  avatarUrl: null,
  emailVerified: true,
  appMetadata: {},
}
const PLAN = '33333333-3333-4333-8333-333333333333'

beforeEach(() => {
  getServerUser.mockResolvedValue(user)
  for (const fn of Object.values(write)) fn.mockResolvedValue({ ok: true })
})
afterEach(() => vi.clearAllMocks())

describe('budget actions', () => {
  it('create, rename and recolor pots for the session user only', async () => {
    await expect(createPotAction({ name: ' Viagens ', color: 'sky' })).resolves.toEqual({
      ok: true,
    })
    expect(write.createPot).toHaveBeenCalledWith('session-user', { name: 'Viagens', color: 'sky' })
    await expect(
      updatePotAction({ key: 'comfort', name: 'Lazer', goal: 'minimum' }),
    ).resolves.toEqual({
      ok: true,
    })
    expect(write.updatePot).toHaveBeenCalledWith('session-user', {
      key: 'comfort',
      name: 'Lazer',
      goal: 'minimum',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/painel', 'layout')
  })

  it('refuse bad input before touching the database', async () => {
    await expect(createPotAction({ name: '', color: 'sky' })).resolves.toMatchObject({
      error: 'Dê um nome ao pote.',
    })
    await expect(createPotAction({ name: 'X', color: 'neon' })).resolves.toMatchObject({
      ok: false,
    })
    await expect(updatePotAction({ key: 'Bad Key!' })).resolves.toMatchObject({ ok: false })
    await expect(updatePotAction({ key: 'comfort', archived: true })).resolves.toMatchObject({
      ok: false,
    })
    await expect(removePotAction(42)).resolves.toMatchObject({ ok: false })
    await expect(
      saveBudgetPlanAction({ id: null, startsMonth: '2026-12', targets: { a: 6000, b: 5000 } }),
    ).resolves.toMatchObject({ error: 'A soma dos potes não pode passar de 100%.' })
    await expect(
      saveBudgetPlanAction({ id: null, startsMonth: 'dez', targets: {} }),
    ).resolves.toMatchObject({ error: 'Mês inválido.' })
    await expect(deleteBudgetPlanAction('nope')).resolves.toMatchObject({ ok: false })
    for (const fn of Object.values(write)) expect(fn).not.toHaveBeenCalled()
  })

  it('tell an archived pot from a deleted one', async () => {
    write.removePot.mockResolvedValue({ ok: true, outcome: 'archived' })
    await expect(removePotAction('essential')).resolves.toEqual({ ok: true, archived: true })
    write.removePot.mockResolvedValue({ ok: true, outcome: 'deleted' })
    await expect(removePotAction('p_abc')).resolves.toEqual({ ok: true, archived: false })
  })

  it('save and delete versions, mapping write failures to messages', async () => {
    const plan = { id: PLAN, startsMonth: '2026-12', targets: { essential: 3300 } }
    await expect(saveBudgetPlanAction(plan)).resolves.toEqual({ ok: true })
    expect(write.saveBudgetPlan).toHaveBeenCalledWith('session-user', plan)
    write.saveBudgetPlan.mockResolvedValue({ ok: false, reason: 'duplicate_plan' })
    await expect(saveBudgetPlanAction(plan)).resolves.toMatchObject({
      error: 'Já existe uma versão começando nesse mês.',
    })
    write.deleteBudgetPlan.mockResolvedValue({ ok: false, reason: 'last_plan' })
    await expect(deleteBudgetPlanAction(PLAN)).resolves.toMatchObject({
      error: 'O orçamento precisa de pelo menos uma versão.',
    })
  })

  it('refuse without a session', async () => {
    getServerUser.mockResolvedValue(null)
    for (const result of [
      await createPotAction({ name: 'X', color: 'sky' }),
      await updatePotAction({ key: 'comfort' }),
      await removePotAction('comfort'),
      await saveBudgetPlanAction({ id: null, startsMonth: '2026-12', targets: {} }),
      await deleteBudgetPlanAction(PLAN),
    ]) {
      expect(result).toMatchObject({ ok: false })
    }
  })
})
