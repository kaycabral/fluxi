/**
 * A bank connection's "sign of life": what the sync last read from Pluggy
 * (`bank_feed_items`) turned into a traffic light with a pt-BR reason. Pure:
 * `now` is a parameter; dates are shown in America/Sao_Paulo.
 */

/** Health fields as stored per connection (ISO instants; null = unknown). */
export type ConnectionStatus = {
  itemStatus: string | null
  executionStatus: string | null
  errorCode: string | null
  lastUpdatedAt: string | null
  nextSyncAt: string | null
  consentExpiresAt: string | null
  institutionHealth: string | null
  /** When our sync last read the item; null = never. */
  checkedAt: string | null
}

export type HealthLevel = 'ok' | 'warn' | 'error' | 'unknown'

export type ConnectionHealth = {
  level: HealthLevel
  reason: string
  /** Pluggy is updating it right now. */
  inProgress: boolean
  /** "Próxima atualização: 27/11 às 06:00", when Pluggy scheduled one. */
  next: string | null
}

const HOUR = 3_600_000
const DAY = 24 * HOUR
/** Meu Pluggy auto-syncs every 24h; past 36h something is off. */
export const STALE_AFTER_MS = 36 * HOUR
/** Warn this many days before the Open Finance consent runs out. */
export const CONSENT_WARN_DAYS = 30

/** The institution asks the user to act (log in again, authorize, unlock). */
const NEEDS_USER = new Set([
  'INVALID_CREDENTIALS',
  'ACCOUNT_LOCKED',
  'ACCOUNT_NEEDS_ACTION',
  'ACCOUNT_CREDENTIALS_RESET',
  'USER_AUTHORIZATION_PENDING',
  'USER_AUTHORIZATION_NOT_GRANTED',
  'USER_INPUT_TIMEOUT',
  'CONSENT_REVOKED',
])
const NEEDS_USER_STATUSES = new Set(['LOGIN_ERROR', 'WAITING_USER_INPUT'])
/** The last execution failed on Pluggy's or the institution's side. */
const FAILED = new Set(['ERROR', 'SITE_NOT_AVAILABLE', 'CONNECTION_ERROR'])

const TIME_ZONE = 'America/Sao_Paulo'

const dayKey = (date: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)

const hourMinute = (date: Date) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)

const dayMonth = (date: Date) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
  }).format(date)

/** Calendar days from `a` to `b` in São Paulo. */
function calendarDays(a: Date, b: Date): number {
  return Math.round((Date.parse(dayKey(b)) - Date.parse(dayKey(a))) / DAY)
}

/** "hoje às 06:02", "ontem às 06:02", "há 3 dias". */
export function updatedLabel(at: Date, now: Date): string {
  const days = calendarDays(at, now)
  if (days <= 0) return `hoje às ${hourMinute(at)}`
  if (days === 1) return `ontem às ${hourMinute(at)}`
  return `há ${days} dias`
}

/** "hoje às 06:00", "amanhã às 06:00", "27/11 às 06:00". */
function upcomingLabel(at: Date, now: Date): string {
  const days = calendarDays(now, at)
  if (days === 0) return `hoje às ${hourMinute(at)}`
  if (days === 1) return `amanhã às ${hourMinute(at)}`
  return `${dayMonth(at)} às ${hourMinute(at)}`
}

const parse = (value: string | null): Date | null => {
  if (value === null) return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : new Date(ms)
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function connectionHealth(status: ConnectionStatus, now: Date): ConnectionHealth {
  const nextAt = parse(status.nextSyncAt)
  const next =
    nextAt !== null && nextAt.getTime() > now.getTime()
      ? `Próxima atualização: ${upcomingLabel(nextAt, now)}`
      : null
  const result = (level: HealthLevel, reason: string, inProgress = false): ConnectionHealth => ({
    level,
    reason,
    inProgress,
    next,
  })

  const checkedAt = parse(status.checkedAt)
  if (checkedAt === null || status.itemStatus === null) {
    return result('unknown', 'Ainda não verificada pela sincronização')
  }
  const item = status.itemStatus
  const execution = status.executionStatus ?? ''
  const code = status.errorCode ?? ''

  if (NEEDS_USER_STATUSES.has(item) || NEEDS_USER.has(execution) || NEEDS_USER.has(code)) {
    return result('error', 'O banco pediu nova autorização: reconecte no Meu Pluggy')
  }
  const consent = parse(status.consentExpiresAt)
  if (
    execution === 'CONSENT_EXPIRED' ||
    code === 'CONSENT_EXPIRED' ||
    (consent !== null && consent.getTime() <= now.getTime())
  ) {
    return result('error', 'Consentimento vencido: renove no Meu Pluggy')
  }
  if (FAILED.has(execution) || FAILED.has(code)) {
    return result('error', 'A última atualização falhou')
  }

  if (item === 'UPDATING') return result('warn', 'Atualizando agora…', true)
  const updated = parse(status.lastUpdatedAt)
  if (item === 'OUTDATED') {
    const when = updated === null ? '' : ` (última ${updatedLabel(updated, now)})`
    return result('warn', `Dados desatualizados: a última atualização não terminou${when}`)
  }
  if (now.getTime() - checkedAt.getTime() > STALE_AFTER_MS) {
    return result('warn', `Última verificação do Fluxi: ${updatedLabel(checkedAt, now)}`)
  }
  if (updated === null) return result('warn', 'Sem data da última atualização')
  if (now.getTime() - updated.getTime() > STALE_AFTER_MS) {
    return result('warn', `Atualizada ${updatedLabel(updated, now)}`)
  }
  if (status.institutionHealth !== null && status.institutionHealth !== 'ONLINE') {
    return result('warn', 'Instituição instável no momento')
  }
  if (consent !== null) {
    const days = Math.ceil((consent.getTime() - now.getTime()) / DAY)
    if (days <= CONSENT_WARN_DAYS) {
      return result('warn', `Consentimento vence em ${plural(days, 'dia', 'dias')}`)
    }
  }
  return result('ok', `Atualizada ${updatedLabel(updated, now)}`)
}

const SEVERITY: Record<HealthLevel, number> = { unknown: 0, ok: 1, warn: 2, error: 3 }

/** The most severe of several connections' health (a bank fed by more than one). */
export function worstHealth(healths: readonly ConnectionHealth[]): ConnectionHealth | null {
  let worst: ConnectionHealth | null = null
  for (const health of healths) {
    if (worst === null || SEVERITY[health.level] > SEVERITY[worst.level]) worst = health
  }
  return worst
}
