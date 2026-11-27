import type { NavItem } from '@cbrl/design'
import { CalendarDays, LayoutDashboard, ListIcon, PiggyBank, Target } from 'lucide-react'

/** The pages of the new layout, in the sidebar (and in its loading skeleton). */
export const NAV: NavItem[] = [
  { href: '/painel', label: 'Painel', icon: LayoutDashboard, match: 'exact' },
  { href: '/painel/calendario', label: 'Calendário', icon: CalendarDays, match: 'prefix' },
  { href: '/painel/transacoes', label: 'Transações', icon: ListIcon, match: 'prefix' },
  { href: '/painel/orcamento', label: 'Orçamento', icon: PiggyBank, match: 'prefix' },
  { href: '/painel/objetivos', label: 'Objetivos', icon: Target, match: 'prefix' },
]
