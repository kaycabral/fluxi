import { AppSidebar } from '@/app/painel/_components/app-sidebar'

/** New layout of the app: sidebar navigation (for now, only the calendar). */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppSidebar>{children}</AppSidebar>
}
