import { getServerUser } from '@/lib/auth/server'
import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { Topbar } from './_components/topbar'

export const metadata: Metadata = {
  title: 'Painel — Fluxi',
}

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()
  if (!user) {
    const next = (await headers()).get('x-pathname') ?? '/painel'
    redirect(`/?login=1&next=${encodeURIComponent(next)}`)
  }

  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <Topbar />
      <div className="flex-1">{children}</div>
    </div>
  )
}
