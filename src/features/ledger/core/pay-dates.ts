import { addDays } from './payments'

/** One "mark paid on…" shortcut of the pay menu: a past day, never the future. */
export type PayShortcut = {
  key: 'yesterday' | 'dayBefore' | 'due'
  /** "Ontem", "Anteontem", "No vencimento". */
  label: string
  /** `YYYY-MM-DD`. */
  date: string
}

/** `2026-11-25` → `25/11`. */
export function dayMonth(isoDay: string): string {
  return `${isoDay.slice(8, 10)}/${isoDay.slice(5, 7)}`
}

/**
 * The pay menu's date shortcuts ("Hoje" is the main button): yesterday, the
 * day before, and the due date when it is in the past and not already one of
 * those (paying records a fact, so nothing after `today` is offered).
 */
export function payShortcuts(today: string, dueDate: string): PayShortcut[] {
  const shortcuts: PayShortcut[] = [
    { key: 'yesterday', label: 'Ontem', date: addDays(today, -1) },
    { key: 'dayBefore', label: 'Anteontem', date: addDays(today, -2) },
  ]
  if (dueDate < today && !shortcuts.some((s) => s.date === dueDate)) {
    shortcuts.push({ key: 'due', label: 'No vencimento', date: dueDate })
  }
  return shortcuts
}

/** Short visible label of the pay control: the action when unpaid, the state when paid. */
export function payControlLabel(amountCents: number, paid: boolean): string {
  const income = amountCents > 0
  if (paid) return income ? 'Recebido' : 'Pago'
  return income ? 'Receber' : 'Pagar'
}

/** Whether a paid date is acceptable: a past fact, so never after `today`. */
export function isPayableDate(paidOn: string, today: string): boolean {
  return paidOn <= today
}

/** The error of a paid date after today (checked server-side). */
export const FUTURE_PAID_DATE = 'A data do pagamento não pode ser no futuro.'
