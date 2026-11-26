'use client'

import type { ConnectionHealth, HealthLevel } from '@/features/bank-feed/core/health'
import {
  StatusDot,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  type StatusDotProps,
} from '@cbrl/design'

const TONE: Record<HealthLevel, NonNullable<StatusDotProps['tone']>> = {
  ok: 'success',
  warn: 'warning',
  error: 'destructive',
  unknown: 'muted',
}

/** "Conexão: Atualizada hoje às 06:02. Próxima atualização: …" (what the dot means). */
export function healthLabel(health: ConnectionHealth): string {
  return [`Conexão: ${health.reason}`, health.next].filter(Boolean).join('. ')
}

/** The bare dot (inside another tooltip, e.g. the dashboard's bank breakdown). */
export function HealthDot({ health }: { health: ConnectionHealth }) {
  return (
    <StatusDot tone={TONE[health.level]} pulse={health.inProgress} label={healthLabel(health)} />
  )
}

/** The dot with its own tooltip: the reason and, when known, the next update. */
export function ConnectionHealthDot({ health }: { health: ConnectionHealth }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={healthLabel(health)}
            data-level={health.level}
            className="focus-visible:ring-ring inline-flex size-4 shrink-0 cursor-default items-center justify-center rounded-full outline-none focus-visible:ring-2"
          >
            <StatusDot tone={TONE[health.level]} pulse={health.inProgress} />
          </button>
        </TooltipTrigger>
        <TooltipContent className="grid gap-0.5">
          <span>{health.reason}</span>
          {health.next !== null && <span className="opacity-80">{health.next}</span>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
