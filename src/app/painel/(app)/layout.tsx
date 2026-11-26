import { AppSidebar } from '@/app/painel/_components/app-sidebar'
import { SIDEBAR_COOKIE, sidebarOpenFrom } from '@/app/painel/_components/sidebar-state'
import { getServerScope } from '@/features/spaces/adapters/scope'
import { readBackend } from '@/lib/backend-read'
import { legacyScreensEnabled } from '@/lib/legacy-screens'
import { cookies } from 'next/headers'

/**
 * New layout of the app: sidebar navigation, expanded or collapsed as the user
 * left it, with the space switcher on top and the current space in the header.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const defaultOpen = sidebarOpenFrom((await cookies()).get(SIDEBAR_COOKIE)?.value)
  const scope = await readBackend('space scope', () => getServerScope())
  const spaces =
    scope.ok && scope.data ? { current: scope.data.space, all: scope.data.spaces } : null
  return (
    <AppSidebar legacyScreens={legacyScreensEnabled()} defaultOpen={defaultOpen} spaces={spaces}>
      {children}
    </AppSidebar>
  )
}
