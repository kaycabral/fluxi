import { INITIAL_FORM_STATE } from '@/features/ledger/core/action-result'
import type { EntryFields } from '@/features/ledger/core/schemas'
import type { SessionUser } from '@cbrl/supabase'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { saveAccountAction, saveBankAction } from './accounts'
import { changeDayAction, createEntryAction, deleteEntryAction, updateEntryAction } from './entries'

type Result = { ok: true } | { ok: false; reason: string }
const write = {
  createEntry: vi.fn<(...args: unknown[]) => Promise<Result>>(),
  updateEntry: vi.fn<(...args: unknown[]) => Promise<Result>>(),
  deleteEntry: vi.fn<(...args: unknown[]) => Promise<Result>>(),
  changeOccurrenceDay: vi.fn<(...args: unknown[]) => Promise<Result>>(),
  createBank: vi.fn<(...args: unknown[]) => Promise<Result>>(),
  updateBank: vi.fn<(...args: unknown[]) => Promise<Result>>(),
  createAccount: vi.fn<(...args: unknown[]) => Promise<Result>>(),
  updateAccount: vi.fn<(...args: unknown[]) => Promise<Result>>(),
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
vi.mock('@/features/ledger/adapters/ledger.repo', () => ({
  listAccounts: vi.fn(),
  listBanks: vi.fn(),
  listConnectedAccountIds: vi.fn(),
}))
vi.mock('@/features/ledger/adapters/projection', () => ({ projectLedger: vi.fn() }))
vi.mock('@/features/ledger/adapters/ledger.write', () => ({
  createEntry: (...a: unknown[]) => write.createEntry(...a),
  updateEntry: (...a: unknown[]) => write.updateEntry(...a),
  deleteEntry: (...a: unknown[]) => write.deleteEntry(...a),
  changeOccurrenceDay: (...a: unknown[]) => write.changeOccurrenceDay(...a),
  createBank: (...a: unknown[]) => write.createBank(...a),
  updateBank: (...a: unknown[]) => write.updateBank(...a),
  createAccount: (...a: unknown[]) => write.createAccount(...a),
  updateAccount: (...a: unknown[]) => write.updateAccount(...a),
}))

const user: SessionUser = {
  id: 'session-user',
  email: 'ana@example.com',
  name: 'Ana',
  avatarUrl: null,
  emailVerified: true,
  appMetadata: {},
}

const ID = '11111111-1111-4111-8111-111111111111'
const ACC = '22222222-2222-4222-8222-222222222222'

const fields: EntryFields = {
  kind: 'expense',
  description: 'Luz',
  amountCents: -26000,
  accountId: ACC,
  toAccountId: null,
  categoryId: null,
  pot: 'essential',
  tags: [],
  startMonth: '2026-12',
  day: 15,
  recurrence: 'monthly',
  repeatEvery: 1,
  monthBy: 'day',
  installments: null,
  endMonth: null,
  parts: [],
}

function form(values: Record<string, string>): FormData {
  const data = new FormData()
  for (const [k, v] of Object.entries(values)) data.set(k, v)
  return data
}

beforeEach(() => {
  getServerUser.mockResolvedValue(user)
  for (const fn of Object.values(write)) fn.mockResolvedValue({ ok: true })
})
afterEach(() => vi.resetAllMocks())

describe('entry actions', () => {
  it('refuse without a session', async () => {
    getServerUser.mockResolvedValue(null)
    await expect(createEntryAction({ id: ID, fields })).resolves.toEqual({
      ok: false,
      error: 'Sessão expirada. Entre novamente.',
    })
    await expect(updateEntryAction({})).resolves.toMatchObject({ ok: false })
    await expect(deleteEntryAction({})).resolves.toMatchObject({ ok: false })
    await expect(changeDayAction({})).resolves.toMatchObject({ ok: false })
    expect(write.createEntry).not.toHaveBeenCalled()
  })

  it('validate the payload', async () => {
    await expect(createEntryAction({ id: 'x', fields })).resolves.toEqual({
      ok: false,
      error: 'Identificador inválido.',
    })
    await expect(updateEntryAction({ entryId: ID })).resolves.toMatchObject({ ok: false })
    await expect(deleteEntryAction({ entryId: ID })).resolves.toMatchObject({ ok: false })
    await expect(
      changeDayAction({ entryId: ID, month: '2026-12', day: 40, scope: null }),
    ).resolves.toEqual({
      ok: false,
      error: 'Dia inválido.',
    })
  })

  it('write as the session user and revalidate', async () => {
    await expect(createEntryAction({ id: ID, fields, userId: 'attacker' })).resolves.toEqual({
      ok: true,
    })
    expect(write.createEntry).toHaveBeenCalledWith(SCOPE, ID, fields)
    expect(revalidatePath).toHaveBeenCalledWith('/painel', 'layout')

    await updateEntryAction({ entryId: ID, month: '2027-01', scope: 'future', fields })
    expect(write.updateEntry).toHaveBeenCalledWith(SCOPE, ID, fields, {
      month: '2027-01',
      scope: 'future',
    })
    await updateEntryAction({ entryId: ID, month: null, scope: null, fields })
    expect(write.updateEntry).toHaveBeenLastCalledWith(SCOPE, ID, fields, null)

    await deleteEntryAction({ entryId: ID, month: '2027-01', scope: 'one' })
    expect(write.deleteEntry).toHaveBeenCalledWith(SCOPE, ID, {
      month: '2027-01',
      scope: 'one',
    })
    await deleteEntryAction({ entryId: ID, month: null, scope: 'all' })
    expect(write.deleteEntry).toHaveBeenLastCalledWith(SCOPE, ID, null)

    await changeDayAction({ entryId: ID, month: '2026-12', day: 3, scope: 'one' })
    expect(write.changeOccurrenceDay).toHaveBeenCalledWith(SCOPE, {
      entryId: ID,
      month: '2026-12',
      day: 3,
      scope: 'one',
    })
  })

  it('map adapter failures to messages', async () => {
    write.updateEntry.mockResolvedValue({ ok: false, reason: 'scope_required' })
    await expect(
      updateEntryAction({ entryId: ID, month: '2027-01', scope: null, fields }),
    ).resolves.toEqual({
      ok: false,
      error: 'Escolha onde aplicar a mudança.',
      scopeRequired: true,
    })
    write.createEntry.mockResolvedValue({ ok: false, reason: 'invalid_reference' })
    await expect(createEntryAction({ id: ID, fields })).resolves.toEqual({
      ok: false,
      error: 'Conta, banco ou categoria inválida.',
    })
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('bank and account actions', () => {
  it('create and update banks', async () => {
    await expect(
      saveBankAction(INITIAL_FORM_STATE, form({ intent: 'create', id: ID, name: 'Nubank' })),
    ).resolves.toMatchObject({
      ok: true,
      error: null,
    })
    expect(write.createBank).toHaveBeenCalledWith(SCOPE, { id: ID, name: 'Nubank' })
    await saveBankAction(INITIAL_FORM_STATE, form({ id: ID, name: 'Nu' }))
    expect(write.updateBank).toHaveBeenCalledWith(SCOPE, { id: ID, name: 'Nu' })
    await expect(saveBankAction(INITIAL_FORM_STATE, form({ id: ID, name: ' ' }))).resolves.toEqual({
      ok: false,
      error: 'Informe o nome.',
      savedAt: 0,
    })
    write.updateBank.mockResolvedValue({ ok: false, reason: 'not_found' })
    await expect(
      saveBankAction(INITIAL_FORM_STATE, form({ id: ID, name: 'X' })),
    ).resolves.toMatchObject({
      ok: false,
    })
  })

  it('create and update accounts', async () => {
    await saveAccountAction(
      INITIAL_FORM_STATE,
      form({
        intent: 'create',
        id: ID,
        bankId: ACC,
        name: 'Conta',
        type: 'checking',
        openingBalance: '1.234,50',
      }),
    )
    expect(write.createAccount).toHaveBeenCalledWith(SCOPE, {
      id: ID,
      bankId: ACC,
      name: 'Conta',
      type: 'checking',
      openingBalanceCents: 123450,
    })
    await saveAccountAction(
      INITIAL_FORM_STATE,
      form({ id: ID, name: 'Cartão', type: 'credit', openingBalance: '-10', active: 'on' }),
    )
    expect(write.updateAccount).toHaveBeenCalledWith(SCOPE, {
      id: ID,
      name: 'Cartão',
      type: 'credit',
      openingBalanceCents: -1000,
      archived: false,
    })
    await saveAccountAction(INITIAL_FORM_STATE, form({ id: ID, name: 'Cartão', type: 'credit' }))
    expect(write.updateAccount).toHaveBeenLastCalledWith(
      SCOPE,
      expect.objectContaining({ archived: true }),
    )
    await expect(
      saveAccountAction(
        INITIAL_FORM_STATE,
        form({ id: ID, name: 'X', type: 'checking', openingBalance: 'abc' }),
      ),
    ).resolves.toMatchObject({ error: 'Saldo inicial inválido.' })
    await expect(
      saveAccountAction(
        INITIAL_FORM_STATE,
        form({ intent: 'create', id: ID, name: 'X', type: 'nope' }),
      ),
    ).resolves.toMatchObject({ ok: false })
    await expect(
      saveAccountAction(INITIAL_FORM_STATE, form({ id: 'bad', name: 'X', type: 'checking' })),
    ).resolves.toMatchObject({
      ok: false,
    })
  })

  it('refuse without a session', async () => {
    getServerUser.mockResolvedValue(null)
    await expect(saveBankAction(INITIAL_FORM_STATE, form({}))).resolves.toMatchObject({ ok: false })
    await expect(saveAccountAction(INITIAL_FORM_STATE, form({}))).resolves.toMatchObject({
      ok: false,
    })
  })
})
