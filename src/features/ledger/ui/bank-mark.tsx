'use client'

import { cn, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@cbrl/design'
import { Landmark } from 'lucide-react'

export const BANK_MARK_LABEL = 'Vem do banco'

/**
 * The discreet "banco" mark of an entry materialized from the bank feed
 * (`entry.fromBank`): a small landmark icon, "Vem do banco" on hover. Inside a
 * button (calendar chips) pass `tooltip={false}`: the icon keeps its label and
 * the button's own title says it.
 */
export function BankMark({ className, tooltip = true }: { className?: string; tooltip?: boolean }) {
  const icon = (
    <span
      role="img"
      aria-label={BANK_MARK_LABEL}
      className={cn('text-muted-foreground inline-flex shrink-0 align-middle', className)}
    >
      <Landmark aria-hidden className="size-3" />
    </span>
  )
  if (!tooltip) return icon
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>{icon}</TooltipTrigger>
        <TooltipContent>{BANK_MARK_LABEL}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
