import { describe, expect, it } from 'vitest'
import { DEFAULT_POTS } from './defaults'
import {
  entryFieldsSchema,
  firstIssue,
  isoDaySchema,
  potTargetsSchema,
  type EntryFields,
} from './schemas'

const ACC = '11111111-1111-4111-8111-111111111111'
const ACC2 = '22222222-2222-4222-8222-222222222222'
const CAT = '33333333-3333-4333-8333-333333333333'

const valid: EntryFields = {
  kind: 'expense',
  description: 'Luz',
  amountCents: 26000,
  accountId: ACC,
  toAccountId: null,
  categoryId: CAT,
  pot: 'essential',
  tags: [],
  startMonth: '2026-12',
  day: 15,
  recurrence: 'monthly',
  repeatEvery: 1,
  monthBy: 'day',
  installments: null,
  endMonth: null,
  parts: [],
}

function issue(patch: Partial<EntryFields>): string | null {
  const result = entryFieldsSchema.safeParse({ ...valid, ...patch })
  return result.success ? null : firstIssue(result.error)
}

describe('entryFieldsSchema', () => {
  it('accepts a valid entry', () => {
    expect(issue({})).toBeNull()
  })

  it('mirrors the database checks', () => {
    expect(issue({ kind: 'transfer', categoryId: null, pot: null, toAccountId: ACC })).toBe(
      'Escolha uma conta diferente da origem.',
    )
    expect(issue({ kind: 'transfer', pot: null, toAccountId: ACC2 })).toBe(
      'Transferência não tem categoria.',
    )
    expect(issue({ toAccountId: ACC2 })).toBe('Só transferências têm conta de destino.')
    expect(issue({ kind: 'income' })).toBe('Só saídas vão para um pote.')
    expect(issue({ recurrence: 'installments' })).toBe('Informe as parcelas.')
    expect(issue({ recurrence: 'none', endMonth: '2027-01' })).toBe(
      'Só repetições mensais ou anuais têm data final.',
    )
    expect(issue({ endMonth: '2026-11' })).toBe('O fim não pode ser antes do início.')
    expect(issue({ parts: [{ label: 'A', bps: 5000, day: 5, nextMonth: false }] })).toBe(
      'As partes precisam somar 100%.',
    )
    expect(issue({ tags: ['a', 'a'] })).toBe('Tag repetida.')
    expect(issue({ amountCents: 0 })).toBe('Informe um valor maior que zero.')
    expect(issue({ day: 32 })).toBe('Dia inválido.')
    expect(issue({ startMonth: '2026-13' })).toBe('Mês inválido.')
  })
})

describe('potTargetsSchema', () => {
  const targets = Object.fromEntries(DEFAULT_POTS.map((p) => [p.key, p.targetBps]))

  it('accepts targets summing to at most 100%', () => {
    expect(potTargetsSchema.safeParse(targets).success).toBe(true)
  })

  it('refuses a sum above 100%', () => {
    const result = potTargetsSchema.safeParse({ ...targets, comfort: 1800 })
    expect(result.success).toBe(false)
    if (!result.success)
      expect(firstIssue(result.error)).toBe('A soma dos potes não pode passar de 100%.')
  })
})

describe('isoDaySchema', () => {
  it('accepts real days and refuses anything else without throwing', () => {
    expect(isoDaySchema.safeParse('2028-02-29').success).toBe(true)
    expect(isoDaySchema.safeParse('2027-02-29').success).toBe(false)
    expect(isoDaySchema.safeParse('').success).toBe(false)
    expect(isoDaySchema.safeParse('ontem').success).toBe(false)
  })
})

describe('entryFieldsSchema · repetition rule', () => {
  const base = {
    kind: 'expense' as const,
    description: 'Luz',
    amountCents: 1000,
    accountId: '00000000-0000-4000-8000-0000000000a1',
    toAccountId: null,
    categoryId: null,
    pot: null,
    tags: [],
    startMonth: '2026-12',
    day: 10,
    recurrence: 'monthly' as const,
    repeatEvery: 1,
    monthBy: 'day' as const,
    installments: null,
    endMonth: null,
    parts: [],
  }
  const issue = (patch: Partial<typeof base> | Record<string, unknown>) => {
    const result = entryFieldsSchema.safeParse({ ...base, ...patch })
    return result.success ? null : firstIssue(result.error)
  }

  it('accepts intervals and weekday rules on the series that take them', () => {
    expect(issue({ repeatEvery: 3, monthBy: 'weekday' })).toBeNull()
    expect(issue({ recurrence: 'yearly', repeatEvery: 2 })).toBeNull()
  })

  it('refuses them elsewhere', () => {
    expect(issue({ recurrence: 'none', repeatEvery: 2 })).toBe(
      'Só repetições mensais ou anuais têm intervalo.',
    )
    expect(issue({ recurrence: 'yearly', monthBy: 'weekday' })).toBe(
      'Só repetições mensais caem num dia da semana.',
    )
    expect(issue({ repeatEvery: 0 })).toBe('Repita a cada 1 ou mais.')
  })
})
