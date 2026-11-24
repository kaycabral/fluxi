import { PainelNav } from '@/app/painel/_components/painel-nav'
import { Topbar } from '@/app/painel/_components/topbar'
import { Footer } from '@/components/footer'

/** MVP screens, kept with their top navigation until each one moves to the new layout. */
export default function LegacyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <Topbar />
      <PainelNav />
      <main className="flex-1">{children}</main>
      <Footer className="mt-12" />
    </div>
  )
}
