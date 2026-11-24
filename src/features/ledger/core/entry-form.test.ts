import { describe, expect, it } from 'vitest'
import {
  addKnownTag,
  addTag,
  amountLabel,
  DEFAULT_PARTS,
  deleteMonthOf,
  editEntryValues,
  installmentsHint,
  isEmptyPatch,
  isOccurrenceEdit,
  newEntryValues,
  normalizeTag,
  occurrencePatchOf,
  partsPercentTotal,
  percentToBps,
  tagSuggestions,
  valuesToFields,
  type EditTarget,
  type EntryFormValues,
} from './entry-form'
import { makeEntry, makeOverride, salarySplit } from './fixtures'

const ACC = '11111111-1111-4111-8111-111111111111'
const ACC2 = '22222222-2222-4222-8222-222222222222'
const CAT = '33333333-3333-4333-8333-333333333333'

function values(overrides: Partial<EntryFormValues> = {}): EntryFormValues {
  return {
    ...newEntryValues({ date: '2026-12-10', accountId: ACC }),
    amount: '260',
    description: 'Luz',
    categoryId: CAT,
    pot: 'essential',
    ...overrides,
  }
}

describe('newEntryValues', () => {
  it('starts as an expense in the variable pot', () => {
    const v = newEntryValues({ date: '2026-12-10', accountId: ACC })
    expect(v).toMatchObject({ kind: 'expense', pot: 'variable', recurrence: 'none', parts: [] })
    expect(newEntryValues({ date: '2026-12-10', accountId: ACC, kind: 'income' }).pot).toBe('')
  })
})

describe('valuesToFields', () => {
  it('converts an expense', () => {
    const result = valuesToFields(
      values({ recurrence: 'monthly', endMonth: '2027-06', tags: ['casa'] }),
    )
    expect(result).toEqual({
      ok: true,
      fields: {
        kind: 'expense',
        description: 'Luz',
        amountCents: 26000,
        accountId: ACC,
        toAccountId: null,
        categoryId: CAT,
        pot: 'essential',
        tags: ['casa'],
        startMonth: '2026-12',
        day: 10,
        recurrence: 'monthly',
        repeatEvery: 1,
        monthBy: 'day',
        installments: null,
        endMonth: '2027-06',
        parts: [],
      },
    })
  })

  it('drops fields that do not apply to the kind or recurrence', () => {
    const income = valuesToFields(
      values({ kind: 'income', endMonth: '2027-01', toAccountId: ACC2 }),
    )
    expect(income.ok && income.fields).toMatchObject({
      pot: null,
      endMonth: null,
      toAccountId: null,
    })
    const transfer = valuesToFields(values({ kind: 'transfer', toAccountId: ACC2 }))
    expect(transfer.ok && transfer.fields).toMatchObject({
      categoryId: null,
      pot: null,
      toAccountId: ACC2,
    })
    const installments = valuesToFields(values({ recurrence: 'installments', installments: '12' }))
    expect(installments.ok && installments.fields.installments).toBe(12)
  })

  it('takes the day from the first part when split', () => {
    const result = valuesToFields(values({ split: true, parts: [...DEFAULT_PARTS] }))
    expect(result.ok && result.fields.day).toBe(20)
    expect(result.ok && result.fields.parts).toEqual([
      { label: 'Adiantamento', bps: 4000, day: 20, nextMonth: false },
      { label: 'Saldo', bps: 6000, day: 5, nextMonth: true },
    ])
  })

  it('reports the first problem', () => {
    expect(valuesToFields(values({ amount: '' }))).toEqual({ ok: false, error: 'Informe o valor.' })
    expect(valuesToFields(values({ date: '' }))).toEqual({ ok: false, error: 'Informe a data.' })
    expect(valuesToFields(values({ accountId: '' }))).toEqual({
      ok: false,
      error: 'Escolha a conta.',
    })
    expect(valuesToFields(values({ description: ' ' }))).toEqual({
      ok: false,
      error: 'Informe a descrição.',
    })
    expect(valuesToFields(values({ kind: 'transfer' }))).toEqual({
      ok: false,
      error: 'Escolha a conta de destino.',
    })
    expect(valuesToFields(values({ recurrence: 'installments', installments: 'x' }))).toEqual({
      ok: false,
      error: 'Informe as parcelas.',
    })
    const parts = DEFAULT_PARTS.map((p) => ({ ...p, percent: '50' })).slice(0, 1)
    expect(valuesToFields(values({ split: true, parts }))).toEqual({
      ok: false,
      error: 'As partes precisam somar 100%.',
    })
  })
})

describe('editing', () => {
  const entry = makeEntry({
    id: 'e1',
    amountCents: 26000,
    day: 15,
    startMonth: '2026-09',
    tags: ['casa'],
    categoryId: CAT,
    accountId: ACC,
  })
  const target: EditTarget = {
    entry,
    parts: [],
    overrides: [makeOverride({ month: '2026-12', amountCents: 30000 })],
    month: '2026-12',
  }

  it('loads the occurrence values', () => {
    expect(isOccurrenceEdit(target)).toBe(true)
    expect(isOccurrenceEdit(null)).toBe(false)
    expect(editEntryValues(target)).toMatchObject({
      amount: '300,00',
      date: '2026-12-15',
      tags: ['casa'],
      split: false,
      installments: '',
      endMonth: '',
    })
    expect(editEntryValues({ ...target, month: null })).toMatchObject({
      amount: '260,00',
      date: '2026-09-15',
    })
  })

  it('edits an installment purchase as a whole, from any month', () => {
    const ring = makeEntry({
      recurrence: 'installments',
      installments: 3,
      amountCents: 600000,
      startMonth: '2026-11',
      day: 24,
    })
    const fromDecember: EditTarget = { entry: ring, parts: [], overrides: [], month: '2026-12' }
    expect(isOccurrenceEdit(fromDecember)).toBe(false)
    expect(editEntryValues(fromDecember)).toMatchObject({ amount: '6000,00', date: '2026-11-24' })
    // Deleting from a month still asks which installments go.
    expect(deleteMonthOf(fromDecember)).toBe('2026-12')
    expect(deleteMonthOf({ ...target, entry: { ...entry, recurrence: 'none' } })).toBeNull()
    expect(deleteMonthOf(null)).toBeNull()
  })

  it('loads parts as percentages', () => {
    const salary = makeEntry({
      id: 's',
      kind: 'income',
      pot: null,
      recurrence: 'installments',
      installments: 3,
    })
    const v = editEntryValues({
      entry: salary,
      parts: salarySplit('s'),
      overrides: [],
      month: null,
    })
    expect(v.split).toBe(true)
    expect(v.installments).toBe('3')
    expect(v.parts.map((p) => p.percent)).toEqual(['40', '60'])
    expect(partsPercentTotal(v.parts)).toBe(100)
  })

  it('detects the amount/day patch of the occurrence', () => {
    const fields = valuesToFields(values({ amount: '300', date: '2026-12-15' }))
    if (!fields.ok) throw new Error(fields.error)
    expect(isEmptyPatch(occurrencePatchOf(target, fields.fields))).toBe(true)
    const changed = valuesToFields(values({ amount: '350', date: '2026-12-20' }))
    if (!changed.ok) throw new Error(changed.error)
    expect(occurrencePatchOf(target, changed.fields)).toEqual({ amountCents: 35000, day: 20 })
    expect(occurrencePatchOf({ ...target, month: null }, changed.fields)).toEqual({})
  })
})

describe('helpers', () => {
  it('parses percentages', () => {
    expect(percentToBps('40,5')).toBe(4050)
    expect(percentToBps('x')).toBeNull()
  })

  it('normalizes tags', () => {
    expect(normalizeTag(' #Viagem 2027 ')).toBe('viagem-2027')
    expect(addTag(['a'], 'B')).toEqual(['a', 'b'])
    expect(addTag(['a'], '#a')).toEqual(['a'])
    expect(addTag(['a'], '  ')).toEqual(['a'])
  })

  it('labels the amount of an installment entry as its total', () => {
    const parcelado = values({ recurrence: 'installments', installments: '3' })
    expect(amountLabel(values())).toBe('Valor')
    expect(amountLabel(parcelado)).toBe('Valor total')
  })

  it('suggests the tags in use that match the draft and are not chosen yet', () => {
    const known = ['casa', 'educação', 'viagem', 'viagem-2027']
    expect(tagSuggestions(known, [], '')).toEqual(known)
    expect(tagSuggestions(known, ['viagem'], '#Via')).toEqual(['viagem-2027'])
    expect(tagSuggestions(known, [], 'educacao')).toEqual(['educação'])
    expect(tagSuggestions(known, [], 'xyz')).toEqual([])
    expect(
      tagSuggestions(
        Array.from({ length: 20 }, (_, i) => `t${i}`),
        [],
        '',
      ),
    ).toHaveLength(8)
    expect(tagSuggestions(['Cabral Tecnologia'], [], 'cabral tec')).toEqual(['Cabral Tecnologia'])
  })

  it('reuses a tag in use spelled its own way instead of forking it', () => {
    const known = ['Cabral Tecnologia', 'educação']
    expect(addKnownTag([], known, 'Cabral Tecnologia')).toEqual(['Cabral Tecnologia'])
    expect(addKnownTag([], known, '#cabral tecnologia')).toEqual(['Cabral Tecnologia'])
    expect(addKnownTag([], known, 'Educacao')).toEqual(['educação'])
    expect(addKnownTag(['Cabral Tecnologia'], known, 'cabral-tecnologia')).toEqual([
      'Cabral Tecnologia',
    ])
    expect(addKnownTag([], known, 'Nova Tag')).toEqual(['nova-tag'])
    expect(addKnownTag([], known, '  ')).toEqual([])
  })

  it('shows how the total is split into installments', () => {
    const hint = (amount: string, installments: string) =>
      installmentsHint(values({ amount, recurrence: 'installments', installments }))
    expect(hint('6000', '3')).toMatch(/^3× R\$\s2\.000,00$/)
    expect(hint('1000', '3')).toMatch(/^1× R\$\s333,34 \+ 2× R\$\s333,33$/)
    expect(hint('', '3')).toBeNull()
    expect(hint('10', '')).toBeNull()
    expect(installmentsHint(values({ amount: '2000' }))).toBeNull()
  })
})

describe('valuesToFields · repetition rule', () => {
  it('keeps the interval and weekday rule only where they apply', () => {
    const fields = (patch: Partial<EntryFormValues>) => {
      const result = valuesToFields(values({ amount: '10', description: 'Luz', ...patch }))
      if (!result.ok) throw new Error(result.error)
      return result.fields
    }
    expect(fields({ recurrence: 'monthly', repeatEvery: 3, monthBy: 'weekday' })).toMatchObject({
      repeatEvery: 3,
      monthBy: 'weekday',
    })
    expect(fields({ recurrence: 'yearly', repeatEvery: 2, monthBy: 'weekday' })).toMatchObject({
      repeatEvery: 2,
      monthBy: 'day',
    })
    expect(fields({ recurrence: 'none', repeatEvery: 3, monthBy: 'weekday' })).toMatchObject({
      repeatEvery: 1,
      monthBy: 'day',
    })
  })
})
