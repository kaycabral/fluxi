'use client'

import { BrandLink } from '@/components/brand-link'
import type { Space } from '@/features/spaces/core/space'
import { SpaceAccountMenu, type MenuAccount } from '@/features/spaces/ui/space-account-menu'
import { useSignOut } from '@/hooks/use-sign-out'
import { writeBrowserCookie } from '@/lib/browser-cookie'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  isNavItemActive,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  TooltipProvider,
  useSidebar,
  type NavItem,
} from '@cbrl/design'
import {
  CalendarDays,
  History,
  LayoutDashboard,
  ListIcon,
  LogOut,
  PiggyBank,
  Settings,
  Target,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { settingsHash, SettingsModal } from './settings-modal'
import { SIDEBAR_COOKIE } from './sidebar-state'

const NAV: NavItem[] = [
  { href: '/painel', label: 'Painel', icon: LayoutDashboard, match: 'exact' },
  { href: '/painel/calendario', label: 'Calendário', icon: CalendarDays, match: 'prefix' },
  { href: '/painel/transacoes', label: 'Transações', icon: ListIcon, match: 'prefix' },
  { href: '/painel/orcamento', label: 'Orçamento', icon: PiggyBank, match: 'prefix' },
  { href: '/painel/objetivos', label: 'Objetivos', icon: Target, match: 'prefix' },
]

/**
 * Chrome of the new layout, composed from the `@cbrl/design` sidebar
 * primitives in Oilio's arrangement: the brand on top, the pages (dashboard,
 * calendar, entries, budget) below it and, at the bottom, one menu whose
 * trigger is the current space and that holds the account, the spaces and the
 * account actions ("Configurações" opens the settings modal, the MVP screens
 * outside production, "Sair"). The header only has "Criar". On desktop the
 * sidebar collapses only by its rail (the edge) or Ctrl/⌘+B — no header
 * button; on mobile, where the sidebar is off-canvas, the header keeps the
 * trigger that opens it.
 */
export function AppSidebar({
  legacyScreens,
  defaultOpen,
  spaces,
  account,
  children,
}: {
  /** The current space and the user's spaces (null when they could not be read). */
  spaces: { current: Space; all: readonly Space[] } | null
  /** Who is signed in (profile, falling back to the session). */
  account: MenuAccount
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

  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider open={open} onOpenChange={changeOpen}>
        <Sidebar collapsible="icon">
          <SidebarHeader>
            <div className="flex items-center gap-2 px-2 py-1.5">
              <BrandLink href="/painel" className="text-base font-bold tracking-tight">
                <span className="group-data-[collapsible=icon]:hidden">Fluxi</span>
                <span className="hidden group-data-[collapsible=icon]:inline">F</span>
              </BrandLink>
            </div>
          </SidebarHeader>
          <SidebarContent>
            <Nav pathname={pathname} />
          </SidebarContent>
          <SidebarFooter>
            <SidebarMenu>
              <SidebarMenuItem>
                <SpaceAccountMenu account={account} spaces={spaces}>
                  <DropdownMenuItem asChild>
                    <a href={settingsHash('conexoes')}>
                      <Settings aria-hidden />
                      Configurações
                    </a>
                  </DropdownMenuItem>
                  {legacyScreens && (
                    <DropdownMenuItem asChild>
                      <Link href="/painel/linha-do-tempo">
                        <History aria-hidden />
                        Telas antigas
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => void signOut()}>
                    <LogOut aria-hidden />
                    Sair
                  </DropdownMenuItem>
                </SpaceAccountMenu>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
          <SidebarRail />
        </Sidebar>
        <SidebarInset>
          <header className="border-border bg-card/60 z-30 flex h-14 shrink-0 items-center gap-3 border-b px-4 backdrop-blur md:hidden">
            <SidebarTrigger className="md:hidden" aria-label="Abrir menu" />
          </header>
          <div
            data-slot="app-scroll"
            className="min-h-0 flex-1 [scrollbar-gutter:stable] overflow-y-auto overscroll-contain has-[[data-fills-viewport]]:[scrollbar-gutter:auto]"
          >
            {children}
          </div>
          <SettingsModal />
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}

function Nav({ pathname }: { pathname: string }) {
  const { setOpenMobile } = useSidebar()
  return (
    <nav aria-label="Seções">
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {NAV.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild
                  isActive={isNavItemActive(item, pathname)}
                  tooltip={item.label}
                >
                  <Link href={{ pathname: item.href }} onClick={() => setOpenMobile(false)}>
                    <item.icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </nav>
  )
}
