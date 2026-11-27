import { Unavailable } from '@/app/painel/_components/unavailable'
import { todayIso } from '@/app/painel/_lib/session'
import { loadRefs } from '@/features/ledger/adapters/views'
import type { LedgerRefs } from '@/features/ledger/core/view'
import { LedgerShell } from '@/features/ledger/ui/ledger-shell'
import { getServerScope } from '@/features/spaces/adapters/scope'
import { getServerUser } from '@/lib/auth/server'
import { readBackend } from '@cbrl/next/server'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

export const metadata: Metadata = {
  title: 'Painel — Fluxi',
}

/**
 * Signed-in area: guards the session and owns the entry sheet. The chrome
 * lives in the route groups: `(app)` is the new sidebar layout (the calendar),
 * `(legacy)` keeps the MVP screens with their top navigation until they move.
 */
export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  // Everything below is per request (session, space, today): the backend reads time
  // their timeouts before touching cookies, so say so up front.
  await connection()
  const user = await getServerUser()
  if (!user) {
    const next = (await headers()).get('x-pathname') ?? '/painel'
    redirect(`/?login=1&next=${encodeURIComponent(next)}`)
  }

  const today = todayIso()
  // The active space (cookie hint resolved against the user's own spaces).
  const scope = await readBackend(
    async () => {
      const resolved = await getServerScope()
      if (!resolved) throw new Error('session vanished while resolving the space')
      return resolved
    },
    { label: 'space scope' },
  )
  const loaded = scope.ok ? await loadRefs(scope.data, today) : { ok: false as const }
  const refs: LedgerRefs = loaded.ok
    ? loaded.data
    : { banks: [], accounts: [], categories: [], budgetGroups: [], tags: [], today }

  return <LedgerShell refs={refs}>{scope.ok ? children : <Unavailable />}</LedgerShell>
}
