import { cn } from '@cbrl/design'
import type { ComponentProps } from 'react'

// TODO: move to @cbrl/design (a toolkit workstream adds a StatusDot primitive);
// until then the success/warning tones follow the app's emerald/amber usage,
// since the design system has no success/warning tokens yet.

export type StatusDotTone = 'success' | 'warning' | 'destructive' | 'muted'

const SIZES = { sm: 'size-2' } as const

const TONES: Record<StatusDotTone, string> = {
  success: 'bg-emerald-500 dark:bg-emerald-400',
  warning: 'bg-amber-500 dark:bg-amber-400',
  destructive: 'bg-destructive',
  muted: 'bg-muted-foreground/40',
}

/**
 * A small colored dot for a status (connection health, …). `label` is what
 * assistive tech reads (the color alone never carries the meaning); `pulse`
 * marks something in progress.
 */
export function StatusDot({
  tone,
  label,
  pulse = false,
  size = 'sm',
  className,
  ...props
}: {
  tone: StatusDotTone
  label: string
  pulse?: boolean
  size?: keyof typeof SIZES
} & Omit<ComponentProps<'span'>, 'children'>) {
  return (
    <span
      role="img"
      aria-label={label}
      data-tone={tone}
      data-pulse={pulse || undefined}
      className={cn('relative inline-flex shrink-0', SIZES[size], className)}
      {...props}
    >
      {pulse && (
        <span
          aria-hidden
          className={cn(
            'absolute inline-flex size-full rounded-full opacity-60 motion-safe:animate-ping',
            TONES[tone],
          )}
        />
      )}
      <span
        aria-hidden
        className={cn('relative inline-flex size-full rounded-full', TONES[tone])}
      />
    </span>
  )
}
