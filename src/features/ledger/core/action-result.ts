/** Result of a ledger server action, shaped for the UI (pt-BR messages). */
/** `undo`: the token that undoes the action ("Desfazer"), when it is undoable. */
export type ActionResult =
  { ok: true; undo?: string } | { ok: false; error: string; scopeRequired?: boolean }

/** State of a `useActionState` form. `savedAt` changes on every success. */
export type FormState = { ok: boolean; error: string | null; savedAt: number }

export const INITIAL_FORM_STATE: FormState = { ok: false, error: null, savedAt: 0 }

export type WriteFailureReason =
  | 'not_found'
  | 'invalid_reference'
  | 'scope_required'
  | 'split_needs_series'
  | 'no_occurrence'
  | 'over_budget'
  | 'undo_expired'
  | 'duplicate_plan'
  | 'last_plan'
  | 'bank_locked'

const MESSAGES: Record<WriteFailureReason, string> = {
  not_found: 'Não encontrado. Atualize a página e tente de novo.',
  invalid_reference: 'Conta, banco ou categoria inválida.',
  scope_required: 'Escolha onde aplicar a mudança.',
  split_needs_series: 'A divisão vale para a repetição: escolha "Este e os próximos" ou "Todos".',
  no_occurrence: 'Esse lançamento não ocorre nesse mês.',
  over_budget: 'A soma dos potes não pode passar de 100%.',
  undo_expired: 'Não dá mais para desfazer essa ação.',
  duplicate_plan: 'Já existe uma versão começando nesse mês.',
  last_plan: 'O orçamento precisa de pelo menos uma versão.',
  bank_locked:
    'Vem do banco: valor, data, conta, tipo, repetição e pagamento não podem ser alterados, nem o lançamento excluído.',
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
