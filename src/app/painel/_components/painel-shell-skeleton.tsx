'use client'

import { NAV } from '@/app/painel/_components/nav'
import { BudgetSkeleton } from '@/app/painel/_components/skeletons/budget-skeleton'
import { CalendarSkeleton } from '@/app/painel/_components/skeletons/calendar-skeleton'
import { DashboardSkeleton } from '@/app/painel/_components/skeletons/dashboard-skeleton'
import { GoalsSkeleton } from '@/app/painel/_components/skeletons/goals-skeleton'
import { LoadingStatus, SKELETON_ROOT, VisualText } from '@/app/painel/_components/skeletons/parts'
import { TransactionsSkeleton } from '@/app/painel/_components/skeletons/transactions-skeleton'
import { BrandMark } from '@/components/brand-mark'
import {
  Button,
  cn,
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
  Skeleton,
  TooltipProvider,
} from '@cbrl/design'
import { ChevronsUpDown, PanelLeftIcon } from 'lucide-react'
import { usePathname } from 'next/navigation'

/** The skeleton of the screen at `pathname` (the legacy screens get the generic one). */
export function RouteSkeleton({ pathname }: { pathname: string }) {
  if (pathname === '/painel') return <DashboardSkeleton />
  if (pathname.startsWith('/painel/calendario')) return <CalendarSkeleton />
  if (pathname.startsWith('/painel/transacoes')) return <TransactionsSkeleton />
  if (pathname.startsWith('/painel/orcamento')) return <BudgetSkeleton />
  if (pathname.startsWith('/painel/objetivos')) return <GoalsSkeleton />
  return <GenericContentSkeleton />
}

/** A page's content for screens with no skeleton of their own (the legacy ones). */
export function GenericContentSkeleton() {
  return (
    <>
      <LoadingStatus />
      <div {...SKELETON_ROOT} className="grid gap-4 p-4 md:p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-80" />
      </div>
    </>
  )
}

/**
 * The sidebar while the session loads: the real primitives (same boxes in both
 * states), the brand and the pages drawn but inert and only visual (the real
 * sidebar brings the links), the space + account menu blank.
 */
function ShellSidebar({ pathname }: { pathname: string }) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:px-1">
          <span className="inline-flex items-center gap-2 text-base font-bold tracking-tight">
            <BrandMark />
            <VisualText text="Fluxi" className="group-data-[collapsible=icon]:sr-only" />
          </span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={isNavItemActive(item, pathname)}>
                    <span>
                      <item.icon />
                      <VisualText text={item.label} />
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" disabled tabIndex={-1}>
              <Skeleton className="size-8 shrink-0 rounded-md" />
              <span className="flex min-w-0 flex-1 flex-col gap-1 text-left">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-3 w-24" />
              </span>
              <ChevronsUpDown className="text-muted-foreground ml-auto size-4" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

/**
 * The painel's chrome and the screen's skeleton while the session, the space
 * and the sidebar load. The static shell cannot read the sidebar cookie, so it
 * draws the sidebar both ways and CSS keeps the one `<html data-sidebar>` names
 * (set before the first paint by `SidebarStateScript`): the real sidebar then
 * takes the very same place.
 */
export function PainelShellSkeleton() {
  const pathname = usePathname()
  return (
    <TooltipProvider delayDuration={0}>
      <LoadingStatus />
      <div {...SKELETON_ROOT} className="flex h-dvh w-full overflow-hidden">
        <SidebarProvider open className="h-auto w-auto [html[data-sidebar=collapsed]_&]:hidden">
          <ShellSidebar pathname={pathname} />
        </SidebarProvider>
        <SidebarProvider
          open={false}
          className="hidden h-auto w-auto [html[data-sidebar=collapsed]_&]:flex"
        >
          <ShellSidebar pathname={pathname} />
        </SidebarProvider>
        <SidebarInset>
          <header className="border-border bg-card/60 z-30 flex h-14 shrink-0 items-center gap-3 border-b px-4 backdrop-blur md:hidden">
            <Button variant="ghost" size="icon-sm" disabled tabIndex={-1}>
              <PanelLeftIcon />
            </Button>
          </header>
          <div
            data-slot="app-scroll"
            className={cn(
              'min-h-0 flex-1 [scrollbar-gutter:stable] overflow-y-auto overscroll-contain',
              'has-[[data-fills-viewport]]:[scrollbar-gutter:auto]',
            )}
          >
            <RouteSkeleton pathname={pathname} />
          </div>
        </SidebarInset>
      </div>
    </TooltipProvider>
  )
}
