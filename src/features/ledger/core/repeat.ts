import { addMonths, daysInMonth, diffMonths, weekdayIn, type Month } from './month'
import type { Entry, MonthBy } from './types'

/**
 * Repetition like Google Calendar's ("Não se repete", "Mensal no dia 26",
 * "Mensal na quarta quinta-feira", "Anual em 26 de novembro",
 * "Personalizar…"): the presets offered for a date, the custom rule and the
 * pt-BR description of a series. Only rules with at most one occurrence a
 * month exist so far (no daily/weekly yet).
 */

export type RepeatRule = {
  recurrence: 'none' | 'monthly' | 'yearly'
  repeatEvery: number
  monthBy: MonthBy
}

export type RepeatPreset = { id: string; label: string; rule: RepeatRule }

const WEEKDAYS = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
]
const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]
const ORDINALS_F = ['primeira', 'segunda', 'terceira', 'quarta']
const ORDINALS_M = ['primeiro', 'segundo', 'terceiro', 'quarto']

/** `list[index]`, or '' out of range (the lists are complete; this only satisfies the types). */
function pick(list: readonly string[], index: number): string {
  return list[index] ?? ''
}

/** Sunday and Saturday are masculine in pt-BR ("no último sábado"). */
function isMasculine(weekday: number): boolean {
  return weekday === 0 || weekday === 6
}

/** "na quarta quinta-feira", "no primeiro domingo", "na última sexta-feira". */
function weekdayPhrase(weekday: number, nth: number | 'last'): string {
  const masculine = isMasculine(weekday)
  const article = masculine ? 'no' : 'na'
  const lastWord = masculine ? 'último' : 'última'
  const ordinal = nth === 'last' ? lastWord : pick(masculine ? ORDINALS_M : ORDINALS_F, nth - 1)
  return `${article} ${ordinal} ${pick(WEEKDAYS, weekday)}`
}

function parts(date: string): { month: Month; day: number } {
  return { month: date.slice(0, 7), day: Number(date.slice(8, 10)) }
}

/** The weekday anchors of `date`: its nth (1–4, or none for a 5th) and whether it is the last of the month. */
export function weekdayAnchor(date: string): {
  weekday: number
  nth: number | null
  last: boolean
} {
  const { month, day } = parts(date)
  const nth = Math.ceil(day / 7)
  return {
    weekday: weekdayIn(month, day),
    nth: nth <= 4 ? nth : null,
    last: day + 7 > daysInMonth(month),
  }
}

const NONE: RepeatRule = { recurrence: 'none', repeatEvery: 1, monthBy: 'day' }

/** Google Calendar's menu for a start date (the weekday options only when they exist). */
export function repeatPresets(date: string): RepeatPreset[] {
  const { month, day } = parts(date)
  const anchor = weekdayAnchor(date)
  const monthly = (monthBy: MonthBy): RepeatRule => ({
    recurrence: 'monthly',
    repeatEvery: 1,
    monthBy,
  })
  const presets: RepeatPreset[] = [
    { id: 'none', label: 'Não se repete', rule: NONE },
    { id: 'monthly-day', label: `Mensal no dia ${day}`, rule: monthly('day') },
  ]
  if (anchor.nth !== null) {
    presets.push({
      id: 'monthly-weekday',
      label: `Mensal ${weekdayPhrase(anchor.weekday, anchor.nth)}`,
      rule: monthly('weekday'),
    })
  }
  if (anchor.last) {
    presets.push({
      id: 'monthly-last-weekday',
      label: `Mensal ${weekdayPhrase(anchor.weekday, 'last')}`,
      rule: monthly('last_weekday'),
    })
  }
  presets.push({
    id: 'yearly',
    label: `Anual em ${day} de ${pick(MONTHS, Number(month.slice(5, 7)) - 1)}`,
    rule: { recurrence: 'yearly', repeatEvery: 1, monthBy: 'day' },
  })
  return presets
}

/** The preset a rule is, or null for a custom one. */
export function presetOf(date: string, rule: RepeatRule): RepeatPreset | null {
  return (
    repeatPresets(date).find(
      (p) =>
        p.rule.recurrence === rule.recurrence &&
        p.rule.repeatEvery === rule.repeatEvery &&
        p.rule.monthBy === rule.monthBy,
    ) ?? null
  )
}

type Series = Pick<
  Entry,
  'recurrence' | 'repeatEvery' | 'monthBy' | 'startMonth' | 'day' | 'installments' | 'endMonth'
>

const SHORT_MONTHS = [
  'jan.',
  'fev.',
  'mar.',
  'abr.',
  'maio',
  'jun.',
  'jul.',
  'ago.',
  'set.',
  'out.',
  'nov.',
  'dez.',
]

/**
 * "Não se repete", "Parcelado em 10×", "Mensal no dia 26", "A cada 2 meses
 * na quarta quinta-feira", "Anual em 26 de novembro, até nov. de 2030".
 */
export function describeRepeat(series: Series): string {
  if (series.recurrence === 'none') return 'Não se repete'
  if (series.recurrence === 'installments') return `Parcelado em ${series.installments ?? 0}×`
  const date = `${series.startMonth}-${String(Math.min(series.day, daysInMonth(series.startMonth))).padStart(2, '0')}`
  const { day } = parts(date)
  const anchor = weekdayAnchor(date)
  let text: string
  if (series.recurrence === 'yearly') {
    const when = `em ${day} de ${pick(MONTHS, Number(series.startMonth.slice(5, 7)) - 1)}`
    text = series.repeatEvery === 1 ? `Anual ${when}` : `A cada ${series.repeatEvery} anos ${when}`
  } else {
    const on =
      series.monthBy === 'day'
        ? `no dia ${day}`
        : weekdayPhrase(
            anchor.weekday,
            series.monthBy === 'last_weekday' ? 'last' : (anchor.nth ?? 4),
          )
    text = series.repeatEvery === 1 ? `Mensal ${on}` : `A cada ${series.repeatEvery} meses ${on}`
  }
  if (series.endMonth === null) return text
  const end = series.endMonth
  return `${text}, até ${pick(SHORT_MONTHS, Number(end.slice(5, 7)) - 1)} de ${end.slice(0, 4)}`
}

/** Months between two occurrences of a rule. */
export function stepMonths(rule: Pick<RepeatRule, 'recurrence' | 'repeatEvery'>): number {
  return rule.recurrence === 'yearly' ? 12 * rule.repeatEvery : rule.repeatEvery
}

/** "Após N ocorrências": the month of the Nth occurrence. */
export function endMonthAfter(startMonth: Month, rule: RepeatRule, count: number): Month {
  return addMonths(startMonth, stepMonths(rule) * (Math.max(1, count) - 1))
}

/**
 * "Termina em <data>": the month of the last occurrence on or before `until`
 * (the occurrence of `until`'s month counts when its day is not after it).
 * Null when not even the first occurrence is that early.
 */
export function endMonthUntil(
  startMonth: Month,
  rule: RepeatRule,
  dayIn: (month: Month) => number,
  until: string,
): Month | null {
  const step = stepMonths(rule)
  const { month, day } = parts(until)
  const span = diffMonths(startMonth, month)
  if (span < 0) return null
  let last = addMonths(startMonth, span - (span % step))
  if (last === month && Math.min(dayIn(last), daysInMonth(last)) > day)
    last = addMonths(last, -step)
  return last < startMonth ? null : last
}

/** How many occurrences a series with an end has (to show "Após N ocorrências"). */
export function occurrenceCount(startMonth: Month, rule: RepeatRule, endMonth: Month): number {
  return Math.floor(diffMonths(startMonth, endMonth) / stepMonths(rule)) + 1
}
