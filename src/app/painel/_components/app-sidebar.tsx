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
import { CalendarDays, History, ListIcon, LogOut, Plus } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

/** Pages that put "Criar" beside their title instead of the header. */
const OWN_CREATE_BUTTON = new Set(['/painel/lancamentos'])

const SECTIONS: NavSection[] = [
  {
    label: '',
    items: [
      { href: '/painel', label: 'Calendário', icon: CalendarDays, match: 'exact' },
      { href: '/painel/lancamentos', label: 'Lançamentos', icon: ListIcon, match: 'prefix' },
    ],
  },
]

/**
 * Chrome of the new layout: collapsible sidebar (calendar and entries),
 * the "Criar" button in the header and, at the bottom, sign-out and (outside
 * production) the way back to the MVP screens.
 */
export function AppSidebar({
  legacyScreens,
  children,
}: {
  /** Show the way back to the MVP screens (never in production). */
  legacyScreens: boolean
  children: React.ReactNode
}) {
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
        // Pages with their own "Criar" beside the title leave the header empty.
        OWN_CREATE_BUTTON.has(pathname) ? undefined : (
          <Button size="sm" onClick={() => openNew()} aria-keyshortcuts="N">
            <Plus /> Criar
          </Button>
        )
      }
      footer={
        <SidebarMenu>
          {legacyScreens && (
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Telas antigas">
                <Link href="/painel/linha-do-tempo">
                  <History />
                  <span>Telas antigas</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
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
