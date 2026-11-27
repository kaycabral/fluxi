import { budgetGroupKeySchema, idSchema, monthSchema } from '@/features/ledger/core/schemas'
import { z } from 'zod'
import { GOAL_KINDS } from './goals'

/** Validation of the goal form, re-run by the server actions (mirrors the `goals` checks). */

const cents = z
  .number()
  .int('Valor inválido.')
  .nonnegative('Valor inválido.')
  .max(1e13, 'Valor alto demais.')

export const goalInputSchema = z
  .object({
    id: idSchema.nullable(),
    name: z.string().trim().min(1, 'Informe o nome.').max(60, 'Nome longo demais.'),
    kind: z.enum(GOAL_KINDS),
    budgetGroup: budgetGroupKeySchema,
    targetCents: cents.positive('Informe o valor.').nullable(),
    targetMonth: monthSchema.nullable(),
    monthlyCents: cents.nullable(),
    initialCents: cents,
    withdrawalBps: z.number().int().min(100, 'Taxa mínima de 1%.').max(1500, 'Taxa máxima de 15%.'),
    accountId: idSchema.nullable(),
  })
  .refine(
    (g) =>
      g.kind === 'purchase' || g.kind === 'recurring'
        ? g.targetCents !== null && g.targetMonth !== null
        : g.targetMonth === null,
    { message: 'Informe o valor e o mês.', path: ['targetMonth'] },
  )
  .transform((g) => ({ ...g, monthlyCents: g.kind === 'independence' ? null : g.monthlyCents }))

export type GoalInput = z.infer<typeof goalInputSchema>
