'use client'

import { BrandLink } from '@/components/brand-link'
import { useLedgerUi } from '@/features/ledger/ui/ledger-shell'
import { useSignOut } from '@/hooks/use-sign-out'
import { writeBrowserCookie } from '@/lib/browser-cookie'
import {
  AppShell,
  Button,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  type NavSection,
} from '@cbrl/design'
import {
  CalendarDays,
  History,
  LayoutDashboard,
  ListIcon,
  LogOut,
  PiggyBank,
  Plus,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { SIDEBAR_COOKIE } from './sidebar-state'

/** Pages that put "Criar" beside their title instead of the header. */
const OWN_CREATE_BUTTON = new Set(['/painel/lancamentos'])

const SECTIONS: NavSection[] = [
  {
    label: '',
    items: [
      { href: '/painel', label: 'Painel', icon: LayoutDashboard, match: 'exact' },
      { href: '/painel/calendario', label: 'Calendário', icon: CalendarDays, match: 'prefix' },
      { href: '/painel/lancamentos', label: 'Lançamentos', icon: ListIcon, match: 'prefix' },
      { href: '/painel/orcamento', label: 'Orçamento', icon: PiggyBank, match: 'prefix' },
    ],
  },
]

/**
 * Chrome of the new layout: collapsible sidebar (dashboard, calendar,
 * entries and budget),
 * the "Criar" button in the header and, at the bottom, sign-out and (outside
 * production) the way back to the MVP screens.
 */
export function AppSidebar({
  legacyScreens,
  defaultOpen,
  children,
}: {
  /** Show the way back to the MVP screens (never in production). */
  legacyScreens: boolean
  /** Expanded or collapsed, as this browser left it (cookie read by the server). */
  defaultOpen: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const changeOpen = (next: boolean) => {
    setOpen(next)
    writeBrowserCookie(SIDEBAR_COOKIE, next ? 'open' : 'collapsed', { path: '/painel' })
  }
  const pathname = usePathname()
  const signOut = useSignOut()
  const { openNew } = useLedgerUi()

  return (
    <AppShell
      open={open}
      onOpenChange={changeOpen}
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
