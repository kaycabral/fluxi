import { forgetUndoAction, undoAction } from '@/features/ledger/adapters/actions/undo'
import { act, fireEvent, renderHook, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isUndoKey, UNDO_TOAST_MS, useUndo } from './undo'

vi.mock('@/features/ledger/adapters/actions/undo', () => ({
  undoAction: vi.fn(),
  forgetUndoAction: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), dismiss: vi.fn() }),
}))

type ToastOptions = {
  duration: number
  action: { label: string; onClick: () => void }
  onAutoClose: () => void
  onDismiss: () => void
}

const TOKEN = '33333333-3333-4333-8333-333333333333'
const OTHER = '44444444-4444-4444-8444-444444444444'

/** The options of the n-th undo toast shown. */
function offered(n = 0): ToastOptions {
  const options: unknown = vi.mocked(toast).mock.calls[n]?.[1]
  if (!isToastOptions(options)) throw new Error(`no undo toast #${String(n)}`)
  return options
}

function isToastOptions(value: unknown): value is ToastOptions {
  return typeof value === 'object' && value !== null && 'action' in value && 'onDismiss' in value
}

const isTyping = (target: EventTarget | null) => target instanceof HTMLInputElement

function setup() {
  return renderHook(() => useUndo(isTyping)).result
}

beforeEach(() => {
  vi.mocked(toast).mockImplementation(() => 'toast-id')
  vi.mocked(undoAction).mockResolvedValue({ ok: true })
  vi.mocked(forgetUndoAction).mockResolvedValue(undefined)
})
afterEach(() => vi.clearAllMocks())

describe('isUndoKey', () => {
  const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init)
  it('takes Z, Ctrl+Z and ⌘Z, never redo or Alt', () => {
    expect(isUndoKey(key({ key: 'z' }))).toBe(true)
    expect(isUndoKey(key({ key: 'Z', ctrlKey: true }))).toBe(true)
    expect(isUndoKey(key({ key: 'z', metaKey: true }))).toBe(true)
    expect(isUndoKey(key({ key: 'z', ctrlKey: true, shiftKey: true }))).toBe(false)
    expect(isUndoKey(key({ key: 'z', altKey: true }))).toBe(false)
    expect(isUndoKey(key({ key: 'z', ctrlKey: true, metaKey: true }))).toBe(false)
    expect(isUndoKey(key({ key: 'y', ctrlKey: true }))).toBe(false)
  })
})

describe('useUndo', () => {
  it('says what happened, with "Desfazer" for a while, and undoes from the toast', async () => {
    const offerUndo = setup()
    act(() => offerUndo.current({ ok: true, undo: TOKEN }, 'Transação excluída.'))
    expect(toast).toHaveBeenCalledWith('Transação excluída.', expect.anything())
    expect(offered().duration).toBe(UNDO_TOAST_MS)
    expect(offered().action.label).toBe('Desfazer')
    act(() => offered().action.onClick())
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Ação desfeita.'))
    expect(undoAction).toHaveBeenCalledWith({ token: TOKEN })
    expect(toast.dismiss).toHaveBeenCalledWith('toast-id')
    // The toast closing after the undo does not drop anything.
    act(() => offered().onDismiss())
    expect(forgetUndoAction).not.toHaveBeenCalled()
  })

  it('undoes with Z or Ctrl+Z, but not while typing nor with nothing to undo', async () => {
    const offerUndo = setup()
    fireEvent.keyDown(window, { key: 'z' })
    expect(undoAction).not.toHaveBeenCalled()

    act(() => offerUndo.current({ ok: true, undo: TOKEN }, 'Transação movida.'))
    const input = document.createElement('input')
    document.body.append(input)
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true })
    expect(undoAction).not.toHaveBeenCalled()
    input.remove()

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    await waitFor(() => expect(undoAction).toHaveBeenCalledWith({ token: TOKEN }))
    // Only once: the action is consumed.
    fireEvent.keyDown(window, { key: 'z' })
    expect(undoAction).toHaveBeenCalledOnce()
  })

  it('reports an undo that came too late', async () => {
    vi.mocked(undoAction).mockResolvedValue({ ok: false, error: 'Tarde demais.' })
    const offerUndo = setup()
    act(() => offerUndo.current({ ok: true, undo: TOKEN }, 'Transação salva.'))
    fireEvent.keyDown(window, { key: 'z' })
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Tarde demais.'))
  })

  it('drops the record of a toast that closed unused, and of the replaced one only on the server', () => {
    const offerUndo = setup()
    act(() => offerUndo.current({ ok: true, undo: TOKEN }, 'Transação salva.'))
    act(() => offerUndo.current({ ok: true, undo: OTHER }, 'Transação movida.'))
    expect(toast.dismiss).toHaveBeenCalledWith('toast-id')
    // The first toast closing (replaced) leaves the newer record alone.
    act(() => offered(0).onDismiss())
    expect(forgetUndoAction).not.toHaveBeenCalled()
    act(() => offered(1).onAutoClose())
    expect(forgetUndoAction).toHaveBeenCalledWith({ token: OTHER })
    fireEvent.keyDown(window, { key: 'z' })
    expect(undoAction).not.toHaveBeenCalled()
  })

  it('only confirms a write with nothing to undo, and ignores a failure', () => {
    const offerUndo = setup()
    act(() => offerUndo.current({ ok: true }, 'Transação salva.'))
    expect(toast.success).toHaveBeenCalledWith('Transação salva.')
    act(() => offerUndo.current({ ok: false, error: 'x' }, 'Transação salva.'))
    expect(toast).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledOnce()
  })
})
