import { AppSidebar } from '@/app/painel/_components/app-sidebar'
import { SIDEBAR_COOKIE, sidebarOpenFrom } from '@/app/painel/_components/sidebar-state'
import { legacyScreensEnabled } from '@/lib/legacy-screens'
import { cookies } from 'next/headers'

/** New layout of the app: sidebar navigation, expanded or collapsed as the user left it. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const defaultOpen = sidebarOpenFrom((await cookies()).get(SIDEBAR_COOKIE)?.value)
  return (
    <AppSidebar legacyScreens={legacyScreensEnabled()} defaultOpen={defaultOpen}>
      {children}
    </AppSidebar>
  )
}
