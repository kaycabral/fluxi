import { AppSidebar } from '@/app/painel/_components/app-sidebar'
import { SIDEBAR_COOKIE, sidebarOpenFrom } from '@/app/painel/_components/sidebar-state'
import { getServerScope } from '@/features/spaces/adapters/scope'
import type { MenuAccount } from '@/features/spaces/ui/space-account-menu'
import { getServerUser } from '@/lib/auth/server'
import { readBackend } from '@/lib/backend-read'
import { getProfile } from '@/lib/db'
import { legacyScreensEnabled } from '@/lib/legacy-screens'
import { cookies } from 'next/headers'

/** Who is signed in: the profile (display name, avatar), falling back to the session claims. */
async function loadAccount(): Promise<MenuAccount> {
  const user = await getServerUser()
  if (!user) return { name: null, email: null, avatarUrl: null }
  const profile = await readBackend('profile', () => getProfile(user.id))
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
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const defaultOpen = sidebarOpenFrom((await cookies()).get(SIDEBAR_COOKIE)?.value)
  const [scope, account] = await Promise.all([
    readBackend('space scope', () => getServerScope()),
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
