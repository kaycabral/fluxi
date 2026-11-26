import type { SessionUser } from '@cbrl/supabase'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEntryAction } from './entries'
import { forgetUndoAction, undoAction } from './undo'

type Result = { ok: true; undo?: string } | { ok: false; reason: string }
const undoLastAction = vi.fn<(...args: unknown[]) => Promise<Result>>()
const forgetUndo = vi.fn<(...args: unknown[]) => Promise<void>>()
const createEntry = vi.fn<(...args: unknown[]) => Promise<Result>>()
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
vi.mock('@/features/ledger/adapters/undo.write', () => ({
  undoLastAction: (...a: unknown[]) => undoLastAction(...a),
  forgetUndo: (...a: unknown[]) => forgetUndo(...a),
}))
vi.mock('@/features/ledger/adapters/ledger.write', () => ({
  createEntry: (...a: unknown[]) => createEntry(...a),
}))

const user: SessionUser = {
  id: 'session-user',
  email: 'ana@example.com',
  name: 'Ana',
  avatarUrl: null,
  emailVerified: true,
  appMetadata: {},
}
const TOKEN = '33333333-3333-4333-8333-333333333333'

beforeEach(() => {
  getServerUser.mockResolvedValue(user)
  undoLastAction.mockResolvedValue({ ok: true })
  forgetUndo.mockResolvedValue(undefined)
})
afterEach(() => vi.clearAllMocks())

describe('undo actions', () => {
  it('undoes the session user’s last action and refreshes the ledger', async () => {
    expect(await undoAction({ token: TOKEN })).toEqual({ ok: true })
    expect(undoLastAction).toHaveBeenCalledWith(SCOPE, TOKEN)
    expect(revalidatePath).toHaveBeenCalledWith('/painel', 'layout')
  })

  it('refuses a late undo, a bad token and a missing session', async () => {
    undoLastAction.mockResolvedValue({ ok: false, reason: 'undo_expired' })
    expect(await undoAction({ token: TOKEN })).toEqual({
      ok: false,
      error: 'Não dá mais para desfazer essa ação.',
    })
    expect(await undoAction({ token: 'x' })).toMatchObject({ ok: false })
    getServerUser.mockResolvedValue(null)
    expect(await undoAction({ token: TOKEN })).toMatchObject({ ok: false })
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it('forgets only with a session and a valid token', async () => {
    await forgetUndoAction({ token: TOKEN })
    expect(forgetUndo).toHaveBeenCalledWith(SCOPE, TOKEN)
    await forgetUndoAction({ token: 'x' })
    getServerUser.mockResolvedValue(null)
    await forgetUndoAction({ token: TOKEN })
    expect(forgetUndo).toHaveBeenCalledOnce()
  })

  it('hands the undo token of a write to the UI', async () => {
    createEntry.mockResolvedValue({ ok: true, undo: TOKEN })
    const result = await createEntryAction({
      id: '11111111-1111-4111-8111-111111111111',
      fields: {
        kind: 'expense',
        description: 'Luz',
        amountCents: -26000,
        accountId: '22222222-2222-4222-8222-222222222222',
        toAccountId: null,
        categoryId: null,
        budgetGroup: 'essential',
        tags: [],
        startMonth: '2026-12',
        day: 10,
        recurrence: 'none',
        repeatEvery: 1,
        monthBy: 'day',
        installments: null,
        endMonth: null,
        parts: [],
      },
    })
    expect(result).toEqual({ ok: true, undo: TOKEN })
  })
})
