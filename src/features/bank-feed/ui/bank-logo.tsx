'use client'

import { institutionColor } from '@/features/bank-feed/core/institution'
import { bankLogoSlug } from '@/features/bank-feed/core/logo'
import { Avatar, AvatarFallback, AvatarImage, cn, initials } from '@cbrl/design'

type BankLogoProps = {
  /** Bank or institution name ("Itaú", "BTG Empresas", "Nu Pagamentos S.A."). */
  name: string
  size?: 'default' | 'sm' | 'lg'
  className?: string
}

/**
 * A bank's avatar: its official logo (vendored in `public/banks/`, never the
 * Pluggy CDN) on a white disc that reads in light and dark, or its initials in
 * the institution's deterministic color when the bank is unknown or the image
 * fails. A plain `<img>` (Radix `AvatarImage`) instead of `next/image`: the
 * files are tiny static SVGs, which the optimizer would pass through anyway.
 */
export function BankLogo({ name, size = 'default', className }: BankLogoProps) {
  const slug = bankLogoSlug(name)
  return (
    <Avatar
      size={size}
      role="img"
      aria-label={name}
      data-bank-logo={slug ?? 'initials'}
      className={cn(slug !== undefined && 'bg-white', className)}
    >
      {slug !== undefined && (
        <AvatarImage src={`/banks/${slug}.svg`} alt="" className="object-contain" />
      )}
      <AvatarFallback
        className={cn(size === 'sm' && 'text-[10px] font-medium', institutionColor(name))}
      >
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  )
}
