'use client'

import { BankLogo } from '@/features/bank-feed/ui/bank-logo'
import type { BankBalance } from '@/features/ledger/core/dashboard'
import {
  AvatarGroup,
  AvatarGroupCount,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@cbrl/design'
import { Money } from '../money'

/** Avatars shown before the "+N" overflow. */
export const MAX_BANK_AVATARS = 4

/**
 * The banks behind "Saldo hoje": overlapping avatars (official logo, or initials
 * in the same deterministic color as Conexões), "+N" past `MAX_BANK_AVATARS`; hovering or
 * focusing lists each bank's balance, highest first (`banks` comes sorted).
 */
export function BankAvatars({ banks }: { banks: readonly BankBalance[] }) {
  const shown = banks.slice(0, MAX_BANK_AVATARS)
  const hidden = banks.length - shown.length
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`Saldo por banco: ${banks.map((b) => b.name).join(', ')}`}
            className="focus-visible:ring-ring inline-flex w-fit cursor-default rounded-full outline-none focus-visible:ring-2"
          >
            <AvatarGroup>
              {shown.map((bank) => (
                <BankLogo key={bank.bankId} name={bank.name} size="sm" />
              ))}
              {hidden > 0 && <AvatarGroupCount>+{hidden}</AvatarGroupCount>}
            </AvatarGroup>
          </button>
        </TooltipTrigger>
        <TooltipContent className="min-w-48">
          <ul aria-label="Saldo por banco" className="grid gap-1">
            {banks.map((bank) => (
              <li key={bank.bankId} className="flex items-baseline justify-between gap-4">
                <span className="truncate">{bank.name}</span>
                <Money cents={bank.cents} className="shrink-0" />
              </li>
            ))}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
