import type { AccountType, EntryKind, PotKey, Recurrence } from './types'

/** pt-BR names shown in the UI for the ledger's enums. */

export const POT_LABELS: Record<PotKey, string> = {
  essential: 'Essencial',
  comfort: 'Conforto',
  guilt_free: 'Livre',
  education: 'Educação',
  variable: 'Variável',
  investment: 'Investimento',
}

/** Tailwind background class per pot (bars, dots). */
export const POT_COLORS: Record<PotKey, string> = {
  essential: 'bg-violet-500 dark:bg-violet-400',
  comfort: 'bg-orange-500 dark:bg-orange-400',
  guilt_free: 'bg-pink-500 dark:bg-pink-400',
  education: 'bg-emerald-600 dark:bg-emerald-400',
  variable: 'bg-yellow-500 dark:bg-yellow-400',
  investment: 'bg-blue-600 dark:bg-blue-400',
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

/** "Pago" for what goes out (expenses, transfers), "Recebido" for income. */
export function paidLabel(kind: EntryKind): 'Pago' | 'Recebido' {
  return kind === 'income' ? 'Recebido' : 'Pago'
}
