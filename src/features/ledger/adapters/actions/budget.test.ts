import type { SessionUser } from '@cbrl/supabase'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createBudgetGroupAction,
  deleteBudgetVersionAction,
  removeBudgetGroupAction,
  saveBudgetVersionAction,
  updateBudgetGroupAction,
} from './budget'

type Result = { ok: true } | { ok: false; reason: string }
const write = {
  createBudgetGroup: vi.fn<(...args: unknown[]) => Promise<Result>>(),
  updateBudgetGroup: vi.fn<(...args: unknown[]) => Promise<Result>>(),
  removeBudgetGroup:
    vi.fn<
      (...args: unknown[]) => Promise<{ ok: true; outcome: 'deleted' | 'archived' } | Result>
    >(),
  saveBudgetVersion: vi.fn<(...args: unknown[]) => Promise<Result>>(),
  deleteBudgetVersion: vi.fn<(...args: unknown[]) => Promise<Result>>(),
}
const getServerUser = vi.fn<() => Promise<SessionUser | null>>()
const revalidatePath = vi.fn<(path: string, type?: string) => void>()

// The scope comes from the session user and the active space (resolved server-side).
const SCOPE = { userId: 'session-user', spaceId: 'space-1' }
vi.mock('@/features/spaces/adapters/scope', () => ({
  getServerScope: async () => ((await getServerUser()) === null ? null : SCOPE),
}))
vi.mock('next/cache', () => ({
  revalidatePath: (path: string, type?: string) => revalidatePath(path, type),
}))
vi.mock('@/features/ledger/adapters/budget.write', () => ({
  createBudgetGroup: (...a: unknown[]) => write.createBudgetGroup(...a),
  updateBudgetGroup: (...a: unknown[]) => write.updateBudgetGroup(...a),
  removeBudgetGroup: (...a: unknown[]) => write.removeBudgetGroup(...a),
  saveBudgetVersion: (...a: unknown[]) => write.saveBudgetVersion(...a),
  deleteBudgetVersion: (...a: unknown[]) => write.deleteBudgetVersion(...a),
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
  it('create, rename and recolor budget groups for the session user only', async () => {
    await expect(createBudgetGroupAction({ name: ' Viagens ', color: 'sky' })).resolves.toEqual({
      ok: true,
    })
    expect(write.createBudgetGroup).toHaveBeenCalledWith(SCOPE, { name: 'Viagens', color: 'sky' })
    await expect(
      updateBudgetGroupAction({ key: 'comfort', name: 'Lazer', goal: 'minimum' }),
    ).resolves.toEqual({
      ok: true,
    })
    expect(write.updateBudgetGroup).toHaveBeenCalledWith(SCOPE, {
      key: 'comfort',
      name: 'Lazer',
      goal: 'minimum',
    })
    expect(revalidatePath).toHaveBeenCalledWith('/painel', 'layout')
  })

  it('refuse bad input before touching the database', async () => {
    await expect(createBudgetGroupAction({ name: '', color: 'sky' })).resolves.toMatchObject({
      error: 'Dê um nome ao grupo.',
    })
    await expect(createBudgetGroupAction({ name: 'X', color: 'neon' })).resolves.toMatchObject({
      ok: false,
    })
    await expect(updateBudgetGroupAction({ key: 'Bad Key!' })).resolves.toMatchObject({ ok: false })
    await expect(
      updateBudgetGroupAction({ key: 'comfort', archived: true }),
    ).resolves.toMatchObject({
      ok: false,
    })
    await expect(removeBudgetGroupAction(42)).resolves.toMatchObject({ ok: false })
    await expect(
      saveBudgetVersionAction({ id: null, startsMonth: '2026-12', targets: { a: 6000, b: 5000 } }),
    ).resolves.toMatchObject({ error: 'A soma dos grupos não pode passar de 100%.' })
    await expect(
      saveBudgetVersionAction({ id: null, startsMonth: 'dez', targets: {} }),
    ).resolves.toMatchObject({ error: 'Mês inválido.' })
    await expect(deleteBudgetVersionAction('nope')).resolves.toMatchObject({ ok: false })
    for (const fn of Object.values(write)) expect(fn).not.toHaveBeenCalled()
  })

  it('tell an archived budget group from a deleted one', async () => {
    write.removeBudgetGroup.mockResolvedValue({ ok: true, outcome: 'archived' })
    await expect(removeBudgetGroupAction('essential')).resolves.toEqual({
      ok: true,
      archived: true,
    })
    write.removeBudgetGroup.mockResolvedValue({ ok: true, outcome: 'deleted' })
    await expect(removeBudgetGroupAction('p_abc')).resolves.toEqual({ ok: true, archived: false })
  })

  it('save and delete versions, mapping write failures to messages', async () => {
    const version = { id: PLAN, startsMonth: '2026-12', targets: { essential: 3300 } }
    await expect(saveBudgetVersionAction(version)).resolves.toEqual({ ok: true })
    expect(write.saveBudgetVersion).toHaveBeenCalledWith(SCOPE, version)
    write.saveBudgetVersion.mockResolvedValue({ ok: false, reason: 'duplicate_version' })
    await expect(saveBudgetVersionAction(version)).resolves.toMatchObject({
      error: 'Já existe uma versão começando nesse mês.',
    })
    write.deleteBudgetVersion.mockResolvedValue({ ok: false, reason: 'last_version' })
    await expect(deleteBudgetVersionAction(PLAN)).resolves.toMatchObject({
      error: 'O orçamento precisa de pelo menos uma versão.',
    })
  })

  it('refuse without a session', async () => {
    getServerUser.mockResolvedValue(null)
    for (const result of [
      await createBudgetGroupAction({ name: 'X', color: 'sky' }),
      await updateBudgetGroupAction({ key: 'comfort' }),
      await removeBudgetGroupAction('comfort'),
      await saveBudgetVersionAction({ id: null, startsMonth: '2026-12', targets: {} }),
      await deleteBudgetVersionAction(PLAN),
    ]) {
      expect(result).toMatchObject({ ok: false })
    }
  })
})
