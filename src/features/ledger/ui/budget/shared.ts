import type { ActionResult } from '@/features/ledger/core/action-result'
import { versionEnd } from '@/features/ledger/core/budget'
import { monthLabel } from '@/features/ledger/core/format'
import type { BudgetVersion } from '@/features/ledger/core/types'
import { useTransition } from 'react'
import { toast } from 'sonner'

/** "dez/2026 em diante" or "jan/2025 – nov/2026". */
export function versionLabel(version: BudgetVersion, versions: readonly BudgetVersion[]): string {
  const end = versionEnd(version, versions)
  return end === null
    ? `${monthLabel(version.startsMonth)} em diante`
    : `${monthLabel(version.startsMonth)} – ${monthLabel(end)}`
}

/** Runs a server action in a transition, toasting its error (or `success`). */
export function useAction() {
  const [pending, startTransition] = useTransition()
  const run = (action: () => Promise<ActionResult>, success?: string, after?: () => void) =>
    startTransition(async () => {
      const result = await action()
      if (!result.ok) toast.error(result.error)
      else {
        if (success !== undefined) toast.success(success)
        after?.()
      }
    })
  return [pending, run] as const
}

/** Ref callback that focuses the element once it mounts (an a11y-friendly `autoFocus`). */
export function focusOnMount(element: HTMLElement | null): void {
  element?.focus()
}
