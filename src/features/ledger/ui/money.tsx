import { formatMoney, formatSignedMoney } from '@/features/ledger/core/format'
import { cn } from '@cbrl/design'

/** Tailwind classes for a signed amount (green positive, red negative). */
export function toneOf(
  cents: number | null,
  { positive = true }: { positive?: boolean } = {},
): string {
  if (cents === null) return ''
  if (cents < 0) return 'text-destructive'
  if (positive && cents > 0) return 'text-emerald-700 dark:text-emerald-400'
  return ''
}

/** A money amount with cents, tabular, optionally signed and toned. */
export function Money({
  cents,
  signed = false,
  tone = false,
  className,
}: {
  cents: number
  signed?: boolean
  /** Color by sign (green/red). */
  tone?: boolean
  className?: string
}) {
  return (
    <span className={cn('font-mono tabular-nums', tone && toneOf(cents), className)}>
      {signed ? formatSignedMoney(cents) : formatMoney(cents)}
    </span>
  )
}
