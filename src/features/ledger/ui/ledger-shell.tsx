'use client'

import {
  editEntryValues,
  newEntryValues,
  type EditTarget,
  type EntryFormValues,
} from '@/features/ledger/core/entry-form'
import { isoDate } from '@/features/ledger/core/format'
import type { Month } from '@/features/ledger/core/month'
import type { EditScope } from '@/features/ledger/core/scoped-edit'
import type { LedgerRefs } from '@/features/ledger/core/view'
import { Dialog, DialogContent } from '@cbrl/design'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { EntryForm } from './entry-sheet'
import { ScopeDialog, type ScopeRequest } from './scope-dialog'

type LedgerUi = {
  refs: LedgerRefs
  /**
   * New entry. `date` pre-fills the date; else `month` (today's day in that
   * month); else today. `values` carries what the quick add already typed.
   */
  openNew: (options?: NewEntryOptions) => void
  /** Edit an entry or one occurrence of it. */
  openEdit: (target: EditTarget) => void
  /** Ask where an occurrence change applies; null when cancelled. */
  requestScope: (request: ScopeRequest) => Promise<EditScope | null>
}

export type NewEntryOptions = {
  month?: Month
  date?: string
  values?: Partial<EntryFormValues>
}

const LedgerUiContext = createContext<LedgerUi | null>(null)

export function useLedgerUi(): LedgerUi {
  const value = useContext(LedgerUiContext)
  if (value === null) throw new Error('useLedgerUi must be used inside <LedgerShell>')
  return value
}

/** First active checking account in bank order (else any active account). */
export function defaultAccountOf(refs: Pick<LedgerRefs, 'banks' | 'accounts'>): string {
  const active = refs.banks.flatMap((bank) =>
    refs.accounts.filter((a) => a.bankId === bank.id && !a.archived),
  )
  return (active.find((a) => a.type === 'checking') ?? active[0])?.id ?? ''
}

type SheetSession = { id: number; target: EditTarget | null; initial: EntryFormValues }

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)
}

/**
 * Signed-in shell of the ledger: owns the full-page entry editor (Google
 * Calendar's event page), the scope dialog and the N shortcut, and exposes them to the views through {@link useLedgerUi}.
 */
export function LedgerShell({ refs, children }: { refs: LedgerRefs; children: React.ReactNode }) {
  const [session, setSession] = useState<SheetSession | null>(null)
  const [open, setOpen] = useState(false)
  const [scopeRequest, setScopeRequest] = useState<ScopeRequest | null>(null)
  const resolveScope = useRef<((scope: EditScope | null) => void) | null>(null)
  const counter = useRef(0)

  const defaultAccountId = defaultAccountOf(refs)

  const openNew = useCallback(
    (options?: NewEntryOptions) => {
      const today = refs.today
      const date =
        options?.date ??
        (options?.month === undefined ? today : isoDate(options.month, Number(today.slice(8, 10))))
      counter.current += 1
      setSession({
        id: counter.current,
        target: null,
        initial: {
          ...newEntryValues({ date, accountId: defaultAccountId, kind: options?.values?.kind }),
          ...options?.values,
        },
      })
      setOpen(true)
    },
    [refs.today, defaultAccountId],
  )

  const openEdit = useCallback((target: EditTarget) => {
    counter.current += 1
    setSession({ id: counter.current, target, initial: editEntryValues(target) })
    setOpen(true)
  }, [])

  const requestScope = useCallback((request: ScopeRequest) => {
    setScopeRequest(request)
    return new Promise<EditScope | null>((resolve) => {
      resolveScope.current = resolve
    })
  }, [])

  const onResolveScope = (scope: EditScope | null) => {
    resolveScope.current?.(scope)
    resolveScope.current = null
    setScopeRequest(null)
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'n' || event.metaKey || event.ctrlKey || event.altKey) return
      if (open || isTyping(event.target)) return
      event.preventDefault()
      openNew()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, openNew])

  const value = useMemo(
    () => ({ refs, openNew, openEdit, requestScope }),
    [refs, openNew, openEdit, requestScope],
  )

  return (
    <LedgerUiContext.Provider value={value}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            document.getElementById('entry-description')?.focus()
          }}
          // Escape on an open autocomplete (tags) closes the list, not the sheet.
          onEscapeKeyDown={(event) => {
            const target = event.target
            if (
              target instanceof HTMLElement &&
              target.getAttribute('role') === 'combobox' &&
              target.getAttribute('aria-expanded') === 'true'
            ) {
              event.preventDefault()
            }
          }}
          className="flex h-dvh max-h-dvh w-screen max-w-none flex-col gap-0 rounded-none border-0 p-0 sm:max-w-none"
        >
          {session !== null && (
            <EntryForm
              key={session.id}
              refs={refs}
              target={session.target}
              initial={session.initial}
              requestScope={requestScope}
              onDone={() => setOpen(false)}
            />
          )}
          {/* Nested inside the dialog while it is open, so Radix stacks the layers (focus trap, outside clicks). */}
          {open && <ScopeDialog request={scopeRequest} onResolve={onResolveScope} />}
        </DialogContent>
      </Dialog>
      {!open && <ScopeDialog request={scopeRequest} onResolve={onResolveScope} />}
    </LedgerUiContext.Provider>
  )
}
