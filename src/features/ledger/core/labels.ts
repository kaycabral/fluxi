import type { AccountType, EntryKind, Pot, PotColor, PotGoal, PotKey, Recurrence } from './types'

/** pt-BR names shown in the UI for the ledger's enums. */

/** pt-BR name of each pot color (color picker). */
export const POT_COLOR_LABELS: Record<PotColor, string> = {
  violet: 'Violeta',
  orange: 'Laranja',
  pink: 'Rosa',
  emerald: 'Esmeralda',
  yellow: 'Amarelo',
  blue: 'Azul',
  sky: 'Céu',
  rose: 'Vermelho',
  teal: 'Verde-água',
  lime: 'Lima',
  amber: 'Âmbar',
  indigo: 'Índigo',
  fuchsia: 'Fúcsia',
  slate: 'Cinza',
}

/** Background class per pot color (bars, dots). Literal strings so Tailwind sees them. */
export const POT_DOT_CLASSES: Record<PotColor, string> = {
  violet: 'bg-violet-500 dark:bg-violet-400',
  orange: 'bg-orange-500 dark:bg-orange-400',
  pink: 'bg-pink-500 dark:bg-pink-400',
  emerald: 'bg-emerald-600 dark:bg-emerald-400',
  yellow: 'bg-yellow-500 dark:bg-yellow-400',
  blue: 'bg-blue-600 dark:bg-blue-400',
  sky: 'bg-sky-500 dark:bg-sky-400',
  rose: 'bg-rose-500 dark:bg-rose-400',
  teal: 'bg-teal-500 dark:bg-teal-400',
  lime: 'bg-lime-500 dark:bg-lime-400',
  amber: 'bg-amber-500 dark:bg-amber-400',
  indigo: 'bg-indigo-500 dark:bg-indigo-400',
  fuchsia: 'bg-fuchsia-500 dark:bg-fuchsia-400',
  slate: 'bg-slate-500 dark:bg-slate-400',
}

/**
 * Row tint per pot color (like a colored row in Notion): the color at low
 * opacity, so the text stays readable in both themes.
 */
export const POT_TINT_CLASSES: Record<PotColor, string> = {
  violet: 'bg-violet-500/10 dark:bg-violet-400/15',
  orange: 'bg-orange-500/10 dark:bg-orange-400/15',
  pink: 'bg-pink-500/10 dark:bg-pink-400/15',
  emerald: 'bg-emerald-600/10 dark:bg-emerald-400/15',
  yellow: 'bg-yellow-500/15 dark:bg-yellow-400/15',
  blue: 'bg-blue-600/10 dark:bg-blue-400/15',
  sky: 'bg-sky-500/10 dark:bg-sky-400/15',
  rose: 'bg-rose-500/10 dark:bg-rose-400/15',
  teal: 'bg-teal-500/10 dark:bg-teal-400/15',
  lime: 'bg-lime-500/15 dark:bg-lime-400/15',
  amber: 'bg-amber-500/15 dark:bg-amber-400/15',
  indigo: 'bg-indigo-500/10 dark:bg-indigo-400/15',
  fuchsia: 'bg-fuchsia-500/10 dark:bg-fuchsia-400/15',
  slate: 'bg-slate-500/10 dark:bg-slate-400/15',
}

export const POT_GOAL_LABELS: Record<PotGoal, string> = {
  limit: 'Limite de gasto',
  minimum: 'Meta mínima',
}

/** The pot behind a key (archived ones included), if the user has it. */
export function potOf(key: PotKey | null, pots: readonly Pot[]): Pot | undefined {
  return key === null ? undefined : pots.find((p) => p.key === key)
}

/** Name of a pot key, or `–` when unknown. */
export function potName(key: PotKey | null, pots: readonly Pot[]): string {
  return potOf(key, pots)?.name ?? '–'
}

/** Dot/bar class of a pot key (muted when unknown). */
export function potDot(key: PotKey | null, pots: readonly Pot[]): string {
  const pot = potOf(key, pots)
  return pot === undefined ? 'bg-muted-foreground/40' : POT_DOT_CLASSES[pot.color]
}

/** Row tint of an entry: its pot's, or none (income, transfers, no pot). */
export function potTint(key: PotKey | null, pots: readonly Pot[]): string | undefined {
  const pot = potOf(key, pots)
  return pot === undefined ? undefined : POT_TINT_CLASSES[pot.color]
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Conta corrente',
  credit: 'Cartão de crédito',
  benefit: 'Benefício',
  investment: 'Investimento',
  loan: 'Empréstimo',
}

export const KIND_LABELS: Record<EntryKind, string> = {
  income: 'Entrada',
  expense: 'Saída',
  transfer: 'Transferência',
}

export const KIND_PLURAL_LABELS: Record<EntryKind, string> = {
  income: 'Entradas',
  expense: 'Saídas',
  transfer: 'Transferências',
}

export const RECURRENCE_LABELS: Record<Recurrence, string> = {
  none: 'Não repete',
  monthly: 'Todo mês',
  yearly: 'Todo ano',
  installments: 'Parcelado',
}

/** "Recebido" for money in (positive amount, refunds included), "Pago" for money out. */
export function paidLabel(amountCents: number): 'Pago' | 'Recebido' {
  return amountCents > 0 ? 'Recebido' : 'Pago'
}
