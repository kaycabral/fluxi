import { AppSidebar } from '@/app/painel/_components/app-sidebar'
import { PainelSkeleton } from '@/app/painel/_components/painel-skeleton'
import { SIDEBAR_COOKIE, sidebarOpenFrom } from '@/app/painel/_components/sidebar-state'
import { getServerScope } from '@/features/spaces/adapters/scope'
import type { MenuAccount } from '@/features/spaces/ui/space-account-menu'
import { getServerUser } from '@/lib/auth/server'
import { getProfile } from '@/lib/db'
import { legacyScreensEnabled } from '@/lib/legacy-screens'
import { readBackend } from '@cbrl/next/server'
import { cookies } from 'next/headers'
import { connection } from 'next/server'
import { Suspense } from 'react'

/** Who is signed in: the profile (display name, avatar), falling back to the session claims. */
async function loadAccount(): Promise<MenuAccount> {
  const user = await getServerUser()
  if (!user) return { name: null, email: null, avatarUrl: null }
  const profile = await readBackend(() => getProfile(user.id), { label: 'profile' })
  const stored = profile.ok ? profile.data : null
  return {
    name: stored?.displayName ?? user.name ?? null,
    email: user.email ?? null,
    avatarUrl: stored?.avatarUrl ?? user.avatarUrl ?? null,
  }
}

/**
 * New layout of the app: sidebar navigation, expanded or collapsed as the user
 * left it, with the space + account menu on top and the current space in the header.
 * The sidebar reads the request (cookie, space, account), so it streams in behind
 * the painel skeleton.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<PainelSkeleton />}>
      <SidebarShell>{children}</SidebarShell>
    </Suspense>
  )
}

/** The sidebar with this browser's open state, the user's spaces and account. */
export async function SidebarShell({ children }: { children: React.ReactNode }) {
  await connection()
  const defaultOpen = sidebarOpenFrom((await cookies()).get(SIDEBAR_COOKIE)?.value)
  const [scope, account] = await Promise.all([
    readBackend(() => getServerScope(), { label: 'space scope' }),
    loadAccount(),
  ])
  const spaces =
    scope.ok && scope.data ? { current: scope.data.space, all: scope.data.spaces } : null
  return (
    <AppSidebar
      legacyScreens={legacyScreensEnabled()}
      defaultOpen={defaultOpen}
      spaces={spaces}
      account={account}
    >
      {children}
    </AppSidebar>
  )
}
