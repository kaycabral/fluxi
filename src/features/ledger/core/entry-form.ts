import { centsToInput, formatMoney, isoDate, monthLabel, parseMoneyInput } from './format'
import type { Month } from './month'
import { amountFor, dayFor, installmentShares, sortParts } from './occurrence'
import { entryFieldsSchema, firstIssue, type EntryFields } from './schemas'
import { sameSplit, type OccurrencePatch } from './scoped-edit'
import type {
  Entry,
  EntryKind,
  EntryOverride,
  EntryPart,
  MonthBy,
  Pot,
  PotKey,
  Recurrence,
} from './types'

/**
 * The entry form's state (strings as typed) and its conversion to/from the
 * domain. Pure, so the sheet stays thin and this logic is unit-tested.
 */

export type PartDraft = { label: string; percent: string; day: string; nextMonth: boolean }

export type EntryFormValues = {
  kind: EntryKind
  /** Magnitude as typed; the sign comes from `kind` and `refund` ({@link signedAmountOf}). */
  amount: string
  /**
   * Against the kind's natural direction: an expense refund ("Estorno/reembolso",
   * stored positive) or an income reversal (kept only when editing one).
   */
  refund: boolean
  description: string
  /** `YYYY-MM-DD`: its month is the start month (or the edited occurrence), its day the day. */
  date: string
  accountId: string
  toAccountId: string
  categoryId: string
  /** Pot key; `''` = no pot. */
  pot: PotKey
  recurrence: Recurrence
  /** Every N months/years (custom repetition). */
  repeatEvery: number
  monthBy: MonthBy
  installments: string
  /** `YYYY-MM` or empty. */
  endMonth: string
  tags: string[]
  split: boolean
  parts: PartDraft[]
}

/** What the sheet is editing: an entry, optionally one occurrence of it (`month`). */
export type EditTarget = {
  entry: Entry
  parts: readonly EntryPart[]
  overrides: readonly EntryOverride[]
  month: Month | null
}

export const DEFAULT_PARTS: readonly PartDraft[] = [
  { label: 'Adiantamento', percent: '40', day: '20', nextMonth: false },
  { label: 'Saldo', percent: '60', day: '5', nextMonth: true },
]

/** Natural direction of a kind: income enters (+), expenses and transfers leave (−). */
const naturalSign = (kind: EntryKind): 1 | -1 => (kind === 'income' ? 1 : -1)

/** Whether a signed amount goes against its kind (expense refund, income reversal). */
export function isReversed(kind: EntryKind, amountCents: number): boolean {
  return Math.sign(amountCents) === -naturalSign(kind)
}

/**
 * The signed amount for a typed magnitude: the kind's direction, flipped by
 * `refund` (never for a transfer, which always leaves its source account).
 */
export function signedAmountOf(kind: EntryKind, refund: boolean, magnitude: number): number {
  const sign = refund && kind !== 'transfer' ? -naturalSign(kind) : naturalSign(kind)
  return magnitude === 0 ? 0 : sign * magnitude
}

/**
 * Pot a new expense starts in: "Variável" while it is active (the catch-all
 * pot), else the first active pot, else none.
 */
export function defaultPotOf(pots: readonly Pick<Pot, 'key' | 'archived' | 'sort'>[]): PotKey {
  const active = pots.filter((p) => !p.archived).sort((a, b) => a.sort - b.sort)
  return (active.find((p) => p.key === 'variable') ?? active[0])?.key ?? ''
}

export function newEntryValues(input: {
  date: string
  accountId: string
  kind?: EntryKind
  /** See {@link defaultPotOf}. */
  defaultPot?: PotKey
}): EntryFormValues {
  return {
    kind: input.kind ?? 'expense',
    amount: '',
    refund: false,
    description: '',
    date: input.date,
    accountId: input.accountId,
    toAccountId: '',
    categoryId: '',
    pot: input.kind === undefined || input.kind === 'expense' ? (input.defaultPot ?? '') : '',
    recurrence: 'none',
    repeatEvery: 1,
    monthBy: 'day',
    installments: '',
    endMonth: '',
    tags: [],
    split: false,
    parts: [],
  }
}

function percentText(bps: number): string {
  return String(bps / 100).replace('.', ',')
}

/**
 * Whether the sheet edits one occurrence of a series (amount/day changes then
 * ask for a scope). An installment purchase is always edited as a whole: its
 * amount is the total, whatever month it was opened from.
 */
export function isOccurrenceEdit(target: EditTarget | null): boolean {
  return (
    target !== null &&
    target.month !== null &&
    target.entry.recurrence !== 'none' &&
    target.entry.recurrence !== 'installments'
  )
}

/** Month of the occurrence a delete applies to (asks for a scope); null deletes the entry. */
export function deleteMonthOf(target: EditTarget | null): Month | null {
  if (target === null || target.entry.recurrence === 'none') return null
  return target.month
}

export function editEntryValues(target: EditTarget): EntryFormValues {
  const { entry } = target
  const ownParts = sortParts(target.parts.filter((p) => p.entryId === entry.id))
  const occurrence = isOccurrenceEdit(target) ? target.month : null
  const month = occurrence ?? entry.startMonth
  const amountCents =
    occurrence === null ? entry.amountCents : amountFor(entry, target.overrides, occurrence)
  const day = occurrence === null ? entry.day : dayFor(entry, target.overrides, occurrence)
  return {
    kind: entry.kind,
    amount: centsToInput(Math.abs(amountCents)),
    refund: isReversed(entry.kind, amountCents),
    description: entry.description,
    date: isoDate(month, day),
    accountId: entry.accountId,
    toAccountId: entry.toAccountId ?? '',
    categoryId: entry.categoryId ?? '',
    pot: entry.pot ?? '',
    recurrence: entry.recurrence,
    repeatEvery: entry.repeatEvery,
    monthBy: entry.monthBy,
    installments: entry.installments === null ? '' : String(entry.installments),
    endMonth: entry.endMonth ?? '',
    tags: [...entry.tags],
    split: ownParts.length > 0,
    parts: ownParts.map((p) => ({
      label: p.label,
      percent: percentText(p.bps),
      day: String(p.day),
      nextMonth: p.nextMonth,
    })),
  }
}

function parseIntOrNull(text: string): number | null {
  if (!/^\s*\d+\s*$/.test(text)) return null
  return Number(text)
}

/** `40`, `40,5`, `40.5` → bps (4000, 4050, 4050); null when not a number. */
export function percentToBps(text: string): number | null {
  const normalized = text.trim().replace(',', '.')
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null
  return Math.round(Number(normalized) * 100)
}

/** Sum of the parts in percent (for the "soma x%" chip). */
export function partsPercentTotal(parts: readonly PartDraft[]): number {
  return parts.reduce((sum, p) => sum + (percentToBps(p.percent) ?? 0), 0) / 100
}

export type FieldsResult = { ok: true; fields: EntryFields } | { ok: false; error: string }

/** Form values → validated domain fields. */
export function valuesToFields(values: EntryFormValues): FieldsResult {
  const magnitude = parseMoneyInput(values.amount)
  if (magnitude === null) return { ok: false, error: 'Informe o valor.' }
  const amountCents = signedAmountOf(values.kind, values.refund, magnitude)
  const date = /^(\d{4}-\d{2})-(\d{2})$/.exec(values.date)
  if (date === null) return { ok: false, error: 'Informe a data.' }
  const parts = values.split
    ? values.parts.map((p, index) => ({
        label: p.label.trim(),
        bps: percentToBps(p.percent) ?? 0,
        day: parseIntOrNull(p.day) ?? 0,
        nextMonth: p.nextMonth,
        index,
      }))
    : []
  const transfer = values.kind === 'transfer'
  const candidate = {
    kind: values.kind,
    description: values.description,
    amountCents,
    accountId: values.accountId,
    toAccountId: transfer ? values.toAccountId || null : null,
    categoryId: transfer ? null : values.categoryId || null,
    pot: values.kind === 'expense' ? values.pot || null : null,
    tags: values.tags,
    startMonth: date[1] ?? '',
    day: parts[0]?.day ?? Number(date[2]),
    recurrence: values.recurrence,
    repeatEvery:
      values.recurrence === 'monthly' || values.recurrence === 'yearly' ? values.repeatEvery : 1,
    monthBy: values.recurrence === 'monthly' ? values.monthBy : 'day',
    installments:
      values.recurrence === 'installments' ? (parseIntOrNull(values.installments) ?? 0) : null,
    endMonth:
      values.recurrence === 'monthly' || values.recurrence === 'yearly'
        ? values.endMonth || null
        : null,
    parts: parts.map(({ label, bps, day, nextMonth }) => ({ label, bps, day, nextMonth })),
  }
  if (values.accountId === '') return { ok: false, error: 'Escolha a conta.' }
  const parsed = entryFieldsSchema.safeParse(candidate)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  return { ok: true, fields: parsed.data }
}

/**
 * Amount/day/split change on the edited occurrence (empty when none changed).
 * The day only counts for entries without parts (parts carry their own days).
 */
export function occurrencePatchOf(target: EditTarget, fields: EntryFields): OccurrencePatch {
  if (!isOccurrenceEdit(target) || target.month === null) return {}
  const patch: OccurrencePatch = {}
  if (fields.amountCents !== amountFor(target.entry, target.overrides, target.month)) {
    patch.amountCents = fields.amountCents
  }
  if (
    fields.parts.length === 0 &&
    fields.day !== dayFor(target.entry, target.overrides, target.month)
  ) {
    patch.day = fields.day
  }
  const own = target.parts.filter((p) => p.entryId === target.entry.id)
  if (!sameSplit(fields.parts, own)) {
    patch.parts = fields.parts.map((p, sort) => ({ id: '', entryId: target.entry.id, sort, ...p }))
  }
  return patch
}

export function isEmptyPatch(patch: OccurrencePatch): boolean {
  return patch.amountCents === undefined && patch.day === undefined && patch.parts === undefined
}

/** Normalize a typed tag (`#Viagem 2027 ` → `viagem-2027`); empty when nothing is left. */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#+/, '').toLocaleLowerCase('pt-BR').replace(/\s+/g, '-').slice(0, 40)
}

/** Add a tag once. */
export function addTag(tags: readonly string[], raw: string): string[] {
  const tag = normalizeTag(raw)
  if (tag === '' || tags.includes(tag) || tags.length >= 20) return [...tags]
  return [...tags, tag]
}

/** At most this many suggestions under the tags input. */
const TAG_SUGGESTIONS = 8

/** A tag compared loosely: normalized and without accents (`#Viagem 2027` ~ `viagem-2027`). */
const tagKey = (tag: string) =>
  normalizeTag(tag)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')

/**
 * The tags already in use that match what is being typed (loosely, see
 * {@link tagKey}) and are not on the entry yet, for the tags autocomplete.
 */
export function tagSuggestions(
  known: readonly string[],
  chosen: readonly string[],
  draft: string,
): string[] {
  const query = tagKey(draft)
  return known
    .filter((tag) => !chosen.includes(tag) && tagKey(tag).includes(query))
    .slice(0, TAG_SUGGESTIONS)
}

/**
 * Add what was typed or picked, reusing a tag already in use when it is the
 * same tag loosely: tags imported with their own spelling (`Cabral
 * Tecnologia`) are kept as they are instead of forking a `cabral-tecnologia`.
 */
export function addKnownTag(
  tags: readonly string[],
  known: readonly string[],
  raw: string,
): string[] {
  const key = tagKey(raw)
  const existing = key === '' ? undefined : known.find((tag) => tagKey(tag) === key)
  if (existing === undefined) return addTag(tags, raw)
  if (tags.includes(existing) || tags.length >= 20) return [...tags]
  return [...tags, existing]
}

/** "Luz em dez/26: valor R$ 260 → R$ 300, dia 15 → 20" for the scope dialog. */
export function describeOccurrenceChange(
  target: EditTarget,
  month: Month,
  patch: OccurrencePatch,
): string {
  const changes: string[] = []
  if (patch.amountCents !== undefined) {
    const before = amountFor(target.entry, target.overrides, month)
    // Magnitudes, unless the direction changes too (an expense turned refund).
    const show =
      Math.sign(before) === Math.sign(patch.amountCents) ? Math.abs : (cents: number) => cents
    changes.push(`valor ${formatMoney(show(before))} → ${formatMoney(show(patch.amountCents))}`)
  }
  if (patch.day !== undefined)
    changes.push(`dia ${dayFor(target.entry, target.overrides, month)} → ${patch.day}`)
  if (patch.parts !== undefined) {
    changes.push(
      patch.parts.length === 0
        ? 'sem divisão'
        : `divisão ${patch.parts.map((p) => `${String(p.bps / 100).replace('.', ',')}% dia ${p.day}`).join(' + ')}`,
    )
  }
  return `${target.entry.description} em ${monthLabel(month)}: ${changes.join(', ')}`
}

/** Label of the amount field: an installment entry takes its total. */
export function amountLabel(values: EntryFormValues): string {
  return values.recurrence === 'installments' ? 'Valor total' : 'Valor'
}

/**
 * How the total of an installment entry is split, under the amount field:
 * "3× R$ 2.000,00", or "1× R$ 333,34 + 2× R$ 333,33" with leftover cents (they go
 * on the first installment). Null when not applicable or not readable yet.
 */
export function installmentsHint(values: EntryFormValues): string | null {
  if (values.recurrence !== 'installments') return null
  const totalCents = parseMoneyInput(values.amount)
  const count = parseIntOrNull(values.installments)
  if (totalCents === null || count === null || count < 1) return null
  const { first, rest } = installmentShares(totalCents, count)
  if (first === rest || count === 1) return `${count}× ${formatMoney(first)}`
  return `1× ${formatMoney(first)} + ${count - 1}× ${formatMoney(rest)}`
}
