import { cn } from '@cbrl/design'
import Link from 'next/link'
import { BrandMark } from './brand-mark'

type FooterProps = {
  className?: string
}

export function Footer({ className }: FooterProps) {
  return (
    <footer className={cn('border-border/60 border-t', className)}>
      <div className="text-muted-foreground mx-auto flex max-w-[1600px] flex-col gap-4 px-4 py-8 text-xs md:flex-row md:items-center md:justify-between md:px-6">
        <p className="text-foreground flex items-center gap-2 text-sm font-semibold">
          <BrandMark className="size-5" />
          Fluxi
        </p>
        <nav aria-label="Rodapé" className="flex items-center gap-4">
          <Link href="/privacidade" className="hover:text-foreground transition-colors">
            Privacidade
          </Link>
          <Link href="/termos" className="hover:text-foreground transition-colors">
            Termos
          </Link>
        </nav>
        <p className="tabular-nums">© {new Date().getFullYear()} · Fluxi</p>
      </div>
    </footer>
  )
}
