'use client'

import {
  lastSyncLabel,
  oldestCheck,
  worstHealth,
  type ConnectionHealth,
} from '@/features/bank-feed/core/health'
import { BankLogo } from '@/features/bank-feed/ui/bank-logo'
import { HealthDot } from '@/features/bank-feed/ui/connection-health-dot'
import type { BankBalance } from '@/features/ledger/core/dashboard'
import {
  AvatarGroup,
  cn,
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
 * focusing lists each bank's balance, highest first (`banks` comes sorted), with
 * the connection's health dot next to connected banks. With connected banks,
 * a label beside them says when the Fluxi last read the banks (the oldest
 * connection), tinted when one of them needs attention.
 */
export function BankAvatars({
  banks,
  health = {},
  today,
}: {
  banks: readonly BankBalance[]
  /** Connection health by bank id: connected banks show a dot, manual ones none. */
  health?: Readonly<Record<string, ConnectionHealth>>
  /** `YYYY-MM-DD` in São Paulo, for "hoje"/"ontem" in the last-sync label. */
  today: string
}) {
  const connected = banks.flatMap((bank) => health[bank.bankId] ?? [])
  const worst = worstHealth(connected)
  const checkedAt = oldestCheck(connected.map((h) => h.checkedAt))
  const sync = connected.length === 0 ? null : syncText(checkedAt, today)
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <BankList banks={banks} health={health} />
      {sync !== null && (
        <span
          title="Quando o Fluxi buscou os dados dos bancos conectados pela última vez"
          className={cn(
            'text-muted-foreground text-xs',
            worst?.level === 'warn' && 'text-amber-700 dark:text-amber-400',
            worst?.level === 'error' && 'text-destructive',
          )}
        >
          {sync}
        </span>
      )}
    </span>
  )
}

function syncText(checkedAt: string | null, today: string): string {
  if (checkedAt === null) return 'Aguardando a 1ª atualização'
  return `Atualizado ${lastSyncLabel(checkedAt, today)}`
}

function BankList({
  banks,
  health,
}: {
  banks: readonly BankBalance[]
  health: Readonly<Record<string, ConnectionHealth>>
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`Saldo por banco: ${banks.map((b) => b.name).join(', ')}`}
            className="focus-visible:ring-ring inline-flex w-fit cursor-default rounded-full outline-none focus-visible:ring-2"
          >
            <AvatarGroup
              max={MAX_BANK_AVATARS}
              overflowLabel={(hidden) => `Mais ${hidden} ${hidden === 1 ? 'banco' : 'bancos'}`}
            >
              {banks.map((bank) => (
                <BankLogo key={bank.bankId} name={bank.name} size="sm" />
              ))}
            </AvatarGroup>
          </button>
        </TooltipTrigger>
        <TooltipContent className="min-w-48">
          <ul aria-label="Saldo por banco" className="grid gap-1">
            {banks.map((bank) => {
              const dot = health[bank.bankId]
              return (
                <li key={bank.bankId} className="flex items-baseline justify-between gap-4">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{bank.name}</span>
                    {dot !== undefined && <HealthDot health={dot} />}
                  </span>
                  <Money cents={bank.cents} className="shrink-0" />
                </li>
              )
            })}
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
