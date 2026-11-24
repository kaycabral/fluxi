import { daysInMonth, type Month } from './month'

/**
 * pt-BR presentation helpers for the ledger UI. Money is integer cents; the
 * tables show whole reais (like the prototype) and the form edits reais with
 * cents.
 */

const MONTH_SHORT = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
]
const MONTH_LONG = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

function monthIndex(month: Month): number {
  return Number(month.slice(5, 7)) - 1
}

/** `2026-12` → `dez/26`. */
export function monthLabel(month: Month): string {
  return `${MONTH_SHORT[monthIndex(month)] ?? ''}/${month.slice(2, 4)}`
}

/** `2026-12` → `dezembro de 2026`. */
export function monthLongLabel(month: Month): string {
  return `${MONTH_LONG[monthIndex(month)] ?? ''} de ${month.slice(0, 4)}`
}

const wholeReais = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const decimalReais = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

/** Whole reais: `-123456` → `-R$ 1.235`. */
export function formatMoney(cents: number): string {
  const reais = Math.round(Math.abs(cents) / 100)
  const sign = cents < 0 && reais > 0 ? '-' : ''
  return `${sign}R$ ${wholeReais.format(reais)}`
}

/** With cents, for where they matter (installment shares): `33334` → `R$ 333,34`. */
export function formatMoneyExact(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  return `${sign}R$ ${decimalReais.format(Math.abs(cents) / 100)}`
}

/** Like {@link formatMoney} with an explicit `+` on positive values. */
export function formatSignedMoney(cents: number): string {
  return cents > 0 && Math.round(cents / 100) > 0 ? `+${formatMoney(cents)}` : formatMoney(cents)
}

/** Compact for dense grids: `1060000` → `10,6k`, `-2450000` → `-24k`, `26000` → `260`. */
export function formatCompactMoney(cents: number): string {
  const reais = Math.abs(cents) / 100
  const sign = cents < 0 && Math.round(reais) > 0 ? '-' : ''
  if (reais >= 1000) {
    const thousands = reais / 1000
    const text = reais >= 10000 ? String(Math.round(thousands)) : thousands.toFixed(1)
    return `${sign}${text.replace('.', ',')}k`
  }
  return `${sign}${Math.round(reais)}`
}

/** `0.325` → `32,5%`. */
export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

/** Cents → the form's text value (`123456` → `1234,56`; 0 → empty). */
export function centsToInput(cents: number): string {
  if (cents === 0) return ''
  return decimalReais.format(cents / 100).replace(/\./g, '')
}

/**
 * The form's text value → cents, or null when it is not a number. Accepts
 * `1234,56`, `1.234,56`, `1234.56` and `1234`.
 */
export function parseMoneyInput(raw: string): number | null {
  const text = raw.trim().replace(/\s|R\$/g, '')
  if (text === '') return null
  let normalized = text
  if (text.includes(',')) {
    normalized = text.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    normalized = text.replace(/\./g, '')
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  return Math.round(Number(normalized) * 100)
}

/** Day of `month` as an ISO date (`YYYY-MM-DD`), clamped to the month's length. */
export function isoDate(month: Month, day: number): string {
  const clamped = Math.min(Math.max(1, day), daysInMonth(month))
  return `${month}-${String(clamped).padStart(2, '0')}`
}

/** `2026-12-05` → `05/12/26`. */
export function shortDate(month: Month, day: number): string {
  return `${String(day).padStart(2, '0')}/${month.slice(5, 7)}/${month.slice(2, 4)}`
}

/** The month of `date` in São Paulo, where the ledger's users live. */
export function monthOf(date: Date, timeZone = 'America/Sao_Paulo'): Month {
  return isoDayOf(date, timeZone).slice(0, 7)
}

/** `YYYY-MM-DD` of `date` in `timeZone`. */
export function isoDayOf(date: Date, timeZone = 'America/Sao_Paulo'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

/** Like {@link parseMoneyInput}, accepting a leading minus (opening balances may be negative). */
export function parseSignedMoneyInput(raw: string): number | null {
  const text = raw.trim()
  const negative = text.startsWith('-')
  const cents = parseMoneyInput(negative ? text.slice(1) : text)
  if (cents === null) return null
  return negative ? -cents : cents
}

/** Cents → editable text keeping the sign (`-1050` → `-10,50`; 0 → `0`). */
export function signedCentsToInput(cents: number): string {
  if (cents === 0) return '0'
  return `${cents < 0 ? '-' : ''}${centsToInput(Math.abs(cents))}`
}
