import { PainelNav } from '@/app/painel/_components/painel-nav'
import { Topbar } from '@/app/painel/_components/topbar'
import { todayIso } from '@/app/painel/_lib/session'
import { Footer } from '@/components/footer'
import { loadRefs } from '@/features/ledger/adapters/views'
import type { LedgerRefs } from '@/features/ledger/core/view'
import { LedgerShell } from '@/features/ledger/ui/ledger-shell'
import { getServerUser } from '@/lib/auth/server'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Painel — Fluxi',
}

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()
  if (!user) {
    const next = (await headers()).get('x-pathname') ?? '/painel'
    redirect(`/?login=1&next=${encodeURIComponent(next)}`)
  }

  const today = todayIso()
  const loaded = await loadRefs(user.id, today)
  const refs: LedgerRefs = loaded.ok
    ? loaded.data
    : { banks: [], accounts: [], categories: [], descriptions: [], today }

  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <Topbar />
      <PainelNav />
      <LedgerShell refs={refs}>
        <main className="flex-1">{children}</main>
      </LedgerShell>
      {/* Bottom padding clears the floating "+ Lançamento" button. */}
      <Footer className="mt-12 pb-24" />
    </div>
  )
}
