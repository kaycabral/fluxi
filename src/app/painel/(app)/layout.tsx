import { AppSidebar } from '@/app/painel/_components/app-sidebar'
import { legacyScreensEnabled } from '@/lib/legacy-screens'

/** New layout of the app: sidebar navigation (for now, only the calendar). */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppSidebar legacyScreens={legacyScreensEnabled()}>{children}</AppSidebar>
}
