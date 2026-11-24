import { PainelNav } from '@/app/painel/_components/painel-nav'
import { Topbar } from '@/app/painel/_components/topbar'
import { Footer } from '@/components/footer'
import { legacyScreensEnabled } from '@/lib/legacy-screens'
import { notFound } from 'next/navigation'

/**
 * MVP screens, kept with their top navigation until each one moves to the new
 * layout. Not in production (404 there).
 */
export default function LegacyLayout({ children }: { children: React.ReactNode }) {
  if (!legacyScreensEnabled()) notFound()
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <Topbar />
      <PainelNav />
      <main className="flex-1">{children}</main>
      <Footer className="mt-12" />
    </div>
  )
}
