/** Result of a ledger server action, shaped for the UI (pt-BR messages). */
export type ActionResult = { ok: true } | { ok: false; error: string; scopeRequired?: boolean }

/** State of a `useActionState` form. `savedAt` changes on every success. */
export type FormState = { ok: boolean; error: string | null; savedAt: number }

export const INITIAL_FORM_STATE: FormState = { ok: false, error: null, savedAt: 0 }

export type WriteFailureReason =
  'not_found' | 'invalid_reference' | 'scope_required' | 'no_occurrence' | 'over_budget'

const MESSAGES: Record<WriteFailureReason, string> = {
  not_found: 'Não encontrado. Atualize a página e tente de novo.',
  invalid_reference: 'Conta, banco ou categoria inválida.',
  scope_required: 'Escolha onde aplicar a mudança.',
  no_occurrence: 'Esse lançamento não ocorre nesse mês.',
  over_budget: 'A soma dos potes não pode passar de 100%.',
}

export const SESSION_EXPIRED = 'Sessão expirada. Entre novamente.'

export function failureResult(reason: WriteFailureReason): ActionResult {
  return reason === 'scope_required'
    ? { ok: false, error: MESSAGES[reason], scopeRequired: true }
    : { ok: false, error: MESSAGES[reason] }
}

export function failureMessage(reason: WriteFailureReason): string {
  return MESSAGES[reason]
}

/** Text value of a form field ('' when absent or a file). */
export function formText(formData: FormData, name: string): string {
  const value = formData.get(name)
  return typeof value === 'string' ? value : ''
}
