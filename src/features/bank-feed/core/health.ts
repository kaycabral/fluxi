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

/** The health columns of a `bank_feed_items` row (timestamps as the driver returns them). */
export type ConnectionStatusRow = {
  itemStatus: string | null
  executionStatus: string | null
  errorCode: string | null
  lastUpdatedAt: Date | null
  nextSyncAt: Date | null
  consentExpiresAt: Date | null
  institutionHealth: string | null
  checkedAt: Date | null
}

const iso = (value: Date | null) => value?.toISOString() ?? null

/** A stored row → serializable {@link ConnectionStatus} (ISO strings). */
export function connectionStatusOf(row: ConnectionStatusRow): ConnectionStatus {
  return {
    itemStatus: row.itemStatus,
    executionStatus: row.executionStatus,
    errorCode: row.errorCode,
    lastUpdatedAt: iso(row.lastUpdatedAt),
    nextSyncAt: iso(row.nextSyncAt),
    consentExpiresAt: iso(row.consentExpiresAt),
    institutionHealth: row.institutionHealth,
    checkedAt: iso(row.checkedAt),
  }
}

/** Never read by the sync. */
export const NEVER_CHECKED: ConnectionStatus = {
  itemStatus: null,
  executionStatus: null,
  errorCode: null,
  lastUpdatedAt: null,
  nextSyncAt: null,
  consentExpiresAt: null,
  institutionHealth: null,
  checkedAt: null,
}

export type HealthLevel = 'ok' | 'warn' | 'error' | 'unknown'

export type ConnectionHealth = {
  level: HealthLevel
  reason: string
  /** Pluggy is updating it right now. */
  inProgress: boolean
  /** "Próxima atualização: 27/11 às 06:00", when Pluggy scheduled one. */
  next: string | null
  /** When the Fluxi sync last read the connection (ISO instant); null = never. */
  checkedAt: string | null
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

const dayMonthYear = (date: Date) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
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

type Verdict = { level: HealthLevel; reason: string; inProgress?: boolean }

/** The institution or the last execution failed: the user has to act. */
function errorOf(status: ConnectionStatus, item: string, now: Date): Verdict | null {
  const execution = status.executionStatus ?? ''
  const code = status.errorCode ?? ''
  if (NEEDS_USER_STATUSES.has(item) || NEEDS_USER.has(execution) || NEEDS_USER.has(code)) {
    return { level: 'error', reason: 'O banco pediu nova autorização: reconecte no Meu Pluggy' }
  }
  const consent = parse(status.consentExpiresAt)
  const expired = consent !== null && consent.getTime() <= now.getTime()
  if (expired || execution === 'CONSENT_EXPIRED' || code === 'CONSENT_EXPIRED') {
    return { level: 'error', reason: 'Consentimento vencido: renove no Meu Pluggy' }
  }
  if (FAILED.has(execution) || FAILED.has(code)) {
    return { level: 'error', reason: 'A última atualização falhou' }
  }
  return null
}

/** Working: ok, or late, in progress or about to need attention (warn). */
function warningOf(status: ConnectionStatus, item: string, checkedAt: Date, now: Date): Verdict {
  if (item === 'UPDATING') return { level: 'warn', reason: 'Atualizando agora…', inProgress: true }
  const updated = parse(status.lastUpdatedAt)
  if (item === 'OUTDATED') {
    const when = updated === null ? '' : ` (última ${updatedLabel(updated, now)})`
    return {
      level: 'warn',
      reason: `Dados desatualizados: a última atualização não terminou${when}`,
    }
  }
  if (now.getTime() - checkedAt.getTime() > STALE_AFTER_MS) {
    return { level: 'warn', reason: `Última verificação do Fluxi: ${updatedLabel(checkedAt, now)}` }
  }
  if (updated === null) return { level: 'warn', reason: 'Sem data da última atualização' }
  if (now.getTime() - updated.getTime() > STALE_AFTER_MS) {
    return { level: 'warn', reason: `Atualizada ${updatedLabel(updated, now)}` }
  }
  if (status.institutionHealth !== null && status.institutionHealth !== 'ONLINE') {
    return { level: 'warn', reason: 'Instituição instável no momento' }
  }
  const consent = parse(status.consentExpiresAt)
  const days = consent === null ? Infinity : Math.ceil((consent.getTime() - now.getTime()) / DAY)
  if (days <= CONSENT_WARN_DAYS) {
    return { level: 'warn', reason: `Consentimento vence em ${plural(days, 'dia', 'dias')}` }
  }
  return { level: 'ok', reason: `Atualizada ${updatedLabel(updated, now)}` }
}

export function connectionHealth(status: ConnectionStatus, now: Date): ConnectionHealth {
  const nextAt = parse(status.nextSyncAt)
  const next =
    nextAt !== null && nextAt.getTime() > now.getTime()
      ? `Próxima atualização: ${upcomingLabel(nextAt, now)}`
      : null
  const checkedAt = parse(status.checkedAt)
  const item = status.itemStatus
  const verdict: Verdict =
    checkedAt === null || item === null
      ? { level: 'unknown', reason: 'Ainda não verificada pela sincronização' }
      : (errorOf(status, item, now) ?? warningOf(status, item, checkedAt, now))
  return {
    level: verdict.level,
    reason: verdict.reason,
    inProgress: verdict.inProgress ?? false,
    next,
    checkedAt: checkedAt?.toISOString() ?? null,
  }
}

/** The oldest of `instants` (ISO), null when any is null (never read) or there are none. */
export function oldestCheck(instants: readonly (string | null)[]): string | null {
  if (instants.length === 0 || instants.includes(null)) return null
  return instants.reduce((oldest, at) =>
    at !== null && oldest !== null && at < oldest ? at : oldest,
  )
}

/**
 * When the Fluxi last read the banks, for the label next to "Saldo hoje":
 * "hoje, 06:00" and "ontem, 06:00" for the recent days, the full date past
 * that ("23/11 às 06:00", with the year when it is not `today`'s). `today` is
 * `YYYY-MM-DD` in São Paulo, so server and client render the same text.
 */
export function lastSyncLabel(checkedAt: string, today: string): string {
  const at = new Date(checkedAt)
  const day = dayKey(at)
  const days = Math.round((Date.parse(today) - Date.parse(day)) / DAY)
  if (days <= 0) return `hoje, ${hourMinute(at)}`
  if (days === 1) return `ontem, ${hourMinute(at)}`
  const date = day.slice(0, 4) === today.slice(0, 4) ? dayMonth(at) : dayMonthYear(at)
  return `${date} às ${hourMinute(at)}`
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

/** Key of a connected bank with no linked account in "Saldo hoje" (`withConnectedBanks`). */
export const connectionBankKey = (institution: string) => `connection:${institution}`

/**
 * Health per "Saldo hoje" bank: a fluxi bank fed by connections takes the
 * worst of them; a connection with no linked account is keyed by its
 * institution ({@link connectionBankKey}). Manual banks get no entry.
 */
export function healthByBank(
  connections: readonly {
    bankIds: readonly string[]
    institution: string | null
    status: ConnectionStatus
  }[],
  now: Date,
): Record<string, ConnectionHealth> {
  const byKey = new Map<string, ConnectionHealth[]>()
  const add = (key: string, health: ConnectionHealth) =>
    byKey.set(key, [...(byKey.get(key) ?? []), health])
  for (const connection of connections) {
    const health = connectionHealth(connection.status, now)
    if (connection.bankIds.length > 0) {
      for (const bankId of connection.bankIds) add(bankId, health)
    } else if (connection.institution !== null) {
      add(connectionBankKey(connection.institution), health)
    }
  }
  const out: Record<string, ConnectionHealth> = {}
  for (const [key, healths] of byKey) {
    const worst = worstHealth(healths)
    // A bank fed by several connections is as fresh as the oldest of them.
    if (worst !== null)
      out[key] = { ...worst, checkedAt: oldestCheck(healths.map((h) => h.checkedAt)) }
  }
  return out
}
