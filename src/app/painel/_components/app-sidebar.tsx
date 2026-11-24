'use client'

import { BrandLink } from '@/components/brand-link'
import { useLedgerUi } from '@/features/ledger/ui/ledger-shell'
import { useSignOut } from '@/hooks/use-sign-out'
import {
  AppShell,
  Button,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  type NavSection,
} from '@cbrl/design'
import { CalendarDays, History, LogOut, Plus } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const SECTIONS: NavSection[] = [
  {
    label: '',
    items: [{ href: '/painel', label: 'Calendário', icon: CalendarDays, match: 'exact' }],
  },
]

/**
 * Chrome of the new layout: collapsible sidebar (only the calendar so far),
 * the "Criar" button in the header and, at the bottom, the way back to the MVP
 * screens and sign-out.
 */
export function AppSidebar({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const signOut = useSignOut()
  const { openNew } = useLedgerUi()

  return (
    <AppShell
      brand={
        <BrandLink href="/painel" className="text-base font-bold tracking-tight">
          Fluxi
        </BrandLink>
      }
      sections={SECTIONS}
      pathname={pathname}
      navLabel="Seções"
      renderNavLink={(item, { onNavigate, children: content }) => (
        <Link href={{ pathname: item.href }} onClick={onNavigate}>
          {content}
        </Link>
      )}
      headerEnd={
        <Button size="sm" onClick={() => openNew()} aria-keyshortcuts="N">
          <Plus /> Criar
        </Button>
      }
      footer={
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Telas antigas">
              <Link href="/painel/linha-do-tempo">
                <History />
                <span>Telas antigas</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Sair" onClick={() => void signOut()}>
              <LogOut />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      }
    >
      {children}
    </AppShell>
  )
}
