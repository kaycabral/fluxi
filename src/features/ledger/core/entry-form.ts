import { centsToInput, isoDate, parseMoneyInput } from './format'
import type { Month } from './month'
import { amountFor, dayFor, sortParts } from './occurrence'
import { entryFieldsSchema, firstIssue, type EntryFields } from './schemas'
import type { OccurrencePatch } from './scoped-edit'
import type { Entry, EntryKind, EntryOverride, EntryPart, PotKey, Recurrence } from './types'

/**
 * The entry form's state (strings as typed) and its conversion to/from the
 * domain. Pure, so the sheet stays thin and this logic is unit-tested.
 */

export type PartDraft = { label: string; percent: string; day: string; nextMonth: boolean }

export type EntryFormValues = {
  kind: EntryKind
  amount: string
  description: string
  /** `YYYY-MM-DD`: its month is the start month (or the edited occurrence), its day the day. */
  date: string
  accountId: string
  toAccountId: string
  categoryId: string
  pot: PotKey | ''
  recurrence: Recurrence
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

export function newEntryValues(input: {
  date: string
  accountId: string
  kind?: EntryKind
}): EntryFormValues {
  return {
    kind: input.kind ?? 'expense',
    amount: '',
    description: '',
    date: input.date,
    accountId: input.accountId,
    toAccountId: '',
    categoryId: '',
    pot: input.kind === undefined || input.kind === 'expense' ? 'variable' : '',
    recurrence: 'none',
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

/** Whether the target is one occurrence of a recurring entry. */
export function isOccurrenceEdit(target: EditTarget | null): boolean {
  return target !== null && target.month !== null && target.entry.recurrence !== 'none'
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
    amount: centsToInput(amountCents),
    description: entry.description,
    date: isoDate(month, day),
    accountId: entry.accountId,
    toAccountId: entry.toAccountId ?? '',
    categoryId: entry.categoryId ?? '',
    pot: entry.pot ?? '',
    recurrence: entry.recurrence,
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
  const amountCents = parseMoneyInput(values.amount)
  if (amountCents === null) return { ok: false, error: 'Informe o valor.' }
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
 * Amount/day change on the edited occurrence (empty when neither changed).
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
  return patch
}

export function isEmptyPatch(patch: OccurrencePatch): boolean {
  return patch.amountCents === undefined && patch.day === undefined
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
