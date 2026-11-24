'use client'

import { cn } from '@cbrl/design'
import type { Route } from 'next'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS: { href: Route; label: string }[] = [
  { href: '/painel/linha-do-tempo', label: 'Linha do tempo' },
  { href: '/painel/a-pagar', label: 'A pagar' },
  { href: '/painel/lancamentos', label: 'Lançamentos' },
  { href: '/painel/contas', label: 'Bancos e contas' },
  { href: '/painel/orcamento', label: 'Orçamento' },
  { href: '/painel', label: 'Calendário' },
]

/** Top navigation of the MVP screens; "Calendário" leads to the new layout. Scrolls on narrow screens. */
export function PainelNav() {
  const pathname = usePathname()
  return (
    <nav aria-label="Seções" className="border-border/60 border-b">
      <div className="mx-auto flex max-w-[1200px] gap-1 overflow-x-auto px-4 md:px-6">
        {LINKS.map((link) => {
          const active =
            link.href === '/painel' ? pathname === '/painel' : pathname.startsWith(link.href)
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'text-muted-foreground hover:text-foreground border-b-2 border-transparent px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
                active && 'text-foreground border-primary',
              )}
            >
              {link.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
