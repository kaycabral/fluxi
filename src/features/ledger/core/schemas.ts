import { z } from 'zod'
import { POT_COLORS } from './types'

/**
 * Write-side validation shared by the forms (client) and the server actions
 * (which re-validate everything; the client is never trusted). Mirrors the
 * database checks so a bad payload is refused with a readable message before
 * it reaches Postgres. Messages are pt-BR because the UI shows them as-is.
 */

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/

export const monthSchema = z.string().regex(MONTH, 'Mês inválido.')
export const idSchema = z.uuid('Identificador inválido.')
export const potKeySchema = z.string().regex(/^[a-z0-9_]{1,40}$/, 'Pote inválido.')
export const daySchema = z
  .number('Informe o dia.')
  .int('Dia inválido.')
  .min(1, 'Dia inválido.')
  .max(31, 'Dia inválido.')
export const editScopeSchema = z.enum(['one', 'future', 'all'])
export const accountTypeSchema = z.enum(['checking', 'credit', 'benefit', 'investment', 'loan'])

// R$ 1 bilhão: far beyond a household, well inside bigint.
const MAX_CENTS = 100_000_000_000

export const entryPartSchema = z.object({
  label: z.string().trim().min(1, 'Dê um nome a cada parte.').max(60),
  bps: z.number().int().min(1, 'Cada parte precisa de mais de 0%.').max(10000),
  day: daySchema,
  nextMonth: z.boolean(),
})

type Issue = (path: string, message: string) => void

type RefineInput = {
  kind: 'income' | 'expense' | 'transfer'
  accountId: string
  toAccountId: string | null
  categoryId: string | null
  startMonth: string
  recurrence: 'none' | 'monthly' | 'yearly' | 'installments'
  repeatEvery: number
  monthBy: 'day' | 'weekday' | 'last_weekday'
  installments: number | null
  endMonth: string | null
}

function checkTransfer(v: RefineInput, issue: Issue): void {
  if (v.kind !== 'transfer') {
    if (v.toAccountId !== null) issue('toAccountId', 'Só transferências têm conta de destino.')
    return
  }
  if (v.toAccountId === null) issue('toAccountId', 'Escolha a conta de destino.')
  else if (v.toAccountId === v.accountId)
    issue('toAccountId', 'Escolha uma conta diferente da origem.')
  if (v.categoryId !== null) issue('categoryId', 'Transferência não tem categoria.')
}

function checkRecurrence(v: RefineInput, issue: Issue): void {
  if ((v.recurrence === 'installments') !== (v.installments !== null)) {
    issue('installments', 'Informe as parcelas.')
  }
  const repeats = v.recurrence === 'monthly' || v.recurrence === 'yearly'
  if (v.repeatEvery !== 1 && !repeats)
    issue('repeatEvery', 'Só repetições mensais ou anuais têm intervalo.')
  if (v.monthBy !== 'day' && v.recurrence !== 'monthly') {
    issue('monthBy', 'Só repetições mensais caem num dia da semana.')
  }
  if (v.endMonth === null) return
  if (!repeats) {
    issue('endMonth', 'Só repetições mensais ou anuais têm data final.')
  } else if (v.endMonth < v.startMonth) {
    issue('endMonth', 'O fim não pode ser antes do início.')
  }
}

/** Everything the entry form edits, already in domain units (cents, months, bps). */
export const entryFieldsSchema = z
  .object({
    kind: z.enum(['income', 'expense', 'transfer']),
    description: z.string().trim().min(1, 'Informe a descrição.').max(120),
    /** Signed from `accountId`'s point of view: negative = money leaves it. */
    amountCents: z
      .number('Informe o valor.')
      .int()
      .refine((cents) => cents !== 0, 'Informe um valor diferente de zero.')
      .refine((cents) => Math.abs(cents) <= MAX_CENTS, 'Valor alto demais.'),
    accountId: idSchema,
    toAccountId: idSchema.nullable(),
    categoryId: idSchema.nullable(),
    pot: potKeySchema.nullable(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20, 'No máximo 20 tags.'),
    startMonth: monthSchema,
    day: daySchema,
    recurrence: z.enum(['none', 'monthly', 'yearly', 'installments']),
    repeatEvery: z
      .number()
      .int()
      .min(1, 'Repita a cada 1 ou mais.')
      .max(99, 'No máximo a cada 99.'),
    monthBy: z.enum(['day', 'weekday', 'last_weekday']),
    installments: z.number().int().min(1, 'Informe as parcelas.').max(600).nullable(),
    endMonth: monthSchema.nullable(),
    parts: z.array(entryPartSchema).max(12),
  })
  .superRefine((v, ctx) => {
    const issue: Issue = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message })
    checkTransfer(v, issue)
    if (v.kind === 'transfer' && v.amountCents > 0) {
      issue('amountCents', 'Transferência sai da conta de origem (valor negativo).')
    }
    checkRecurrence(v, issue)
    if (v.pot !== null && v.kind !== 'expense') issue('pot', 'Só saídas vão para um pote.')
    if (v.parts.length > 0 && v.parts.reduce((sum, p) => sum + p.bps, 0) !== 10000) {
      issue('parts', 'As partes precisam somar 100%.')
    }
    if (new Set(v.tags).size !== v.tags.length) issue('tags', 'Tag repetida.')
  })

export type EntryFields = z.infer<typeof entryFieldsSchema>

/** Create: the client mints the id, so a double submit is a no-op. */
export const createEntrySchema = z.object({ id: idSchema, fields: entryFieldsSchema })
export type CreateEntryInput = z.infer<typeof createEntrySchema>

/**
 * Update. With `month` (editing one occurrence of a recurring entry) a change
 * of amount/day on that occurrence needs a `scope`; the other fields apply to
 * the whole series. Without `month` the entry is edited as a whole.
 */
export const updateEntrySchema = z.object({
  entryId: idSchema,
  month: monthSchema.nullable(),
  scope: editScopeSchema.nullable(),
  fields: entryFieldsSchema,
})
export type UpdateEntryInput = z.infer<typeof updateEntrySchema>

export const deleteEntrySchema = z.object({
  entryId: idSchema,
  month: monthSchema.nullable(),
  scope: editScopeSchema,
})
export type DeleteEntryInput = z.infer<typeof deleteEntrySchema>

export const changeDaySchema = z.object({
  entryId: idSchema,
  month: monthSchema,
  day: daySchema,
  scope: editScopeSchema.nullable(),
})
export type ChangeDayInput = z.infer<typeof changeDaySchema>

const ISO_DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

/** `YYYY-MM-DD` of a real calendar day (no 31/02). */
export const isoDaySchema = z
  .string()
  .regex(ISO_DAY, 'Data inválida.')
  // The refine also runs when the regex failed (zod 4), so it must not throw on garbage.
  .refine((day) => {
    const time = Date.parse(`${day}T00:00:00Z`)
    return !Number.isNaN(time) && new Date(time).toISOString().startsWith(day)
  }, 'Data inválida.')

/** One payable occurrence: the entry, its competence month and, for a split entry, the part. */
export const paymentKeySchema = z.object({
  entryId: idSchema,
  month: monthSchema,
  partId: idSchema.nullable(),
})

/** "Pago/recebido": `paidOn` defaults to today (server side) when absent. */
export const markPaidSchema = paymentKeySchema.extend({ paidOn: isoDaySchema.optional() })

const nameSchema = z.string().trim().min(1, 'Informe o nome.').max(60, 'Nome longo demais.')

export const createBankSchema = z.object({ id: idSchema, name: nameSchema })
export const updateBankSchema = z.object({ id: idSchema, name: nameSchema })

const centsSchema = z.number().int().min(-MAX_CENTS).max(MAX_CENTS)

export const createAccountSchema = z.object({
  id: idSchema,
  bankId: idSchema,
  name: nameSchema,
  type: accountTypeSchema,
  openingBalanceCents: centsSchema,
})
export const renameAccountSchema = z.object({ id: idSchema, name: nameSchema })
export const archiveAccountSchema = z.object({ id: idSchema, archived: z.boolean() })

export const updateAccountSchema = z.object({
  id: idSchema,
  name: nameSchema,
  type: accountTypeSchema,
  openingBalanceCents: centsSchema,
  archived: z.boolean(),
})
export type CreateAccountInput = z.infer<typeof createAccountSchema>
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>

/** Pot targets in basis points of income; together they never exceed 100%. */
export const potTargetsSchema = z
  .record(potKeySchema, z.number().int().min(0).max(10000))
  .refine((targets) => Object.values(targets).reduce((a, b) => a + b, 0) <= 10000, {
    message: 'A soma dos potes não pode passar de 100%.',
  })
export type PotTargets = z.infer<typeof potTargetsSchema>

const potNameSchema = z
  .string()
  .trim()
  .min(1, 'Dê um nome ao pote.')
  .max(40, 'Nome do pote muito longo (até 40 letras).')
export const potColorSchema = z.enum(POT_COLORS)
export const potGoalSchema = z.enum(['limit', 'minimum'])

export const createPotSchema = z.object({ name: potNameSchema, color: potColorSchema })
export type CreatePotInput = z.infer<typeof createPotSchema>

/** Only the fields given change; `archived: false` brings an archived pot back. */
export const updatePotSchema = z.object({
  key: potKeySchema,
  name: potNameSchema.optional(),
  color: potColorSchema.optional(),
  goal: potGoalSchema.optional(),
  archived: z.literal(false).optional(),
})
export type UpdatePotInput = z.infer<typeof updatePotSchema>

/** A budget version: create (`id` null) or edit one, with its start month and targets. */
export const budgetPlanSchema = z.object({
  id: idSchema.nullable(),
  startsMonth: monthSchema,
  targets: potTargetsSchema,
})
export type BudgetPlanInput = z.infer<typeof budgetPlanSchema>

/** First issue's message, for `{ ok: false, error }` results. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Dados inválidos.'
}

/** "Desfazer": the token the undoable action returned. */
export const undoSchema = z.object({ token: idSchema })
