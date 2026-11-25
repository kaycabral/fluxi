'use client'

import { forgetUndoAction, undoAction } from '@/features/ledger/adapters/actions/undo'
import type { ActionResult } from '@/features/ledger/core/action-result'
import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'

/** How long the "Desfazer" toast stays (it pauses while hovered). */
export const UNDO_TOAST_MS = 10_000

/** Z, or Ctrl+Z / ⌘Z: Google Calendar's undo. Shift (redo) and Alt are left alone. */
export function isUndoKey(event: KeyboardEvent): boolean {
  if (event.key.toLowerCase() !== 'z' || event.shiftKey || event.altKey) return false
  return !(event.ctrlKey && event.metaKey)
}

/**
 * "Desfazer" like Google Calendar's: after an undoable action a toast says
 * what happened with a "Desfazer" button for {@link UNDO_TOAST_MS}, and Z or
 * Ctrl+Z (outside a text field, where they belong to the field) does the same
 * while it shows. Only the last action can be undone; a new one replaces the
 * toast. A toast that closes unused drops its server record right away.
 */
export function useUndo(isTyping: (target: EventTarget | null) => boolean) {
  const offered = useRef<{ token: string; toastId: string | number } | null>(null)

  const undo = useCallback(async () => {
    const current = offered.current
    if (current === null) return
    offered.current = null
    toast.dismiss(current.toastId)
    const result = await undoAction({ token: current.token })
    if (result.ok) toast.success('Ação desfeita.')
    else toast.error(result.error)
  }, [])

  /** Say `message` after a successful action, offering its undo when it has one. */
  const offerUndo = useCallback(
    (result: ActionResult, message: string) => {
      if (!result.ok) return
      const previous = offered.current
      offered.current = null
      if (previous !== null) toast.dismiss(previous.toastId)
      if (result.undo === undefined) {
        toast.success(message)
        return
      }
      const token = result.undo
      const closed = () => {
        if (offered.current?.token !== token) return
        offered.current = null
        void forgetUndoAction({ token })
      }
      const toastId = toast(message, {
        duration: UNDO_TOAST_MS,
        action: { label: 'Desfazer', onClick: () => void undo() },
        onAutoClose: closed,
        onDismiss: closed,
      })
      offered.current = { token, toastId }
    },
    [undo],
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (offered.current === null || !isUndoKey(event) || isTyping(event.target)) return
      event.preventDefault()
      void undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isTyping, undo])

  return offerUndo
}
