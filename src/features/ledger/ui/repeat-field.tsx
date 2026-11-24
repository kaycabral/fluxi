'use client'

import { isoDate } from '@/features/ledger/core/format'
import { dayByRule } from '@/features/ledger/core/occurrence'
import {
  describeRepeat,
  endMonthAfter,
  endMonthUntil,
  occurrenceCount,
  presetOf,
  repeatPresets,
  weekdayAnchor,
  type RepeatRule,
} from '@/features/ledger/core/repeat'
import type { MonthBy, Recurrence } from '@/features/ledger/core/types'
import {
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@cbrl/design'
import { useId, useState } from 'react'

/** The repetition fields of the entry form. */
export type RepeatValue = {
  recurrence: Recurrence
  repeatEvery: number
  monthBy: MonthBy
  /** `YYYY-MM` or empty. */
  endMonth: string
  installments: string
}

const CUSTOM = 'custom'
const CURRENT = 'current'
const INSTALLMENTS = 'installments'

/**
 * Google Calendar's repetition menu for a start date: "Não se repete", the
 * monthly/yearly presets, "Parcelado…" (installments) and "Personalizar…",
 * which opens the custom rule dialog. A custom rule in use shows as its own
 * description.
 */
export function RepeatField({
  id,
  date,
  value,
  onChange,
  withInstallments = false,
  className,
}: {
  id?: string
  /** `YYYY-MM-DD` the series starts on. */
  date: string
  value: RepeatValue
  onChange: (next: RepeatValue) => void
  withInstallments?: boolean
  className?: string
}) {
  const [customOpen, setCustomOpen] = useState(false)
  const presets = repeatPresets(date)
  const rule = ruleOf(value)
  const preset =
    value.recurrence === 'installments' || value.endMonth !== '' ? null : presetOf(date, rule)
  const selected = value.recurrence === 'installments' ? INSTALLMENTS : (preset?.id ?? CURRENT)

  return (
    <>
      <Select
        value={selected}
        onValueChange={(next) => {
          if (next === CUSTOM) return setCustomOpen(true)
          if (next === INSTALLMENTS) {
            return onChange({
              ...value,
              recurrence: 'installments',
              repeatEvery: 1,
              monthBy: 'day',
              endMonth: '',
              installments: value.installments || '12',
            })
          }
          const chosen = presets.find((p) => p.id === next)
          if (chosen !== undefined) onChange({ ...value, ...chosen.rule, endMonth: '' })
        }}
      >
        <SelectTrigger
          size="sm"
          id={id}
          aria-label="Repetição"
          className={cn('w-fit max-w-full', className)}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {presets.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.label}
            </SelectItem>
          ))}
          {selected === CURRENT && <SelectItem value={CURRENT}>{describe(date, value)}</SelectItem>}
          {withInstallments && <SelectItem value={INSTALLMENTS}>Parcelado…</SelectItem>}
          <SelectItem value={CUSTOM}>Personalizar…</SelectItem>
        </SelectContent>
      </Select>
      {customOpen && (
        <CustomRepeatDialog
          open
          date={date}
          value={value}
          onClose={() => setCustomOpen(false)}
          onDone={(next) => {
            setCustomOpen(false)
            onChange(next)
          }}
        />
      )}
    </>
  )
}

function ruleOf(value: RepeatValue): RepeatRule {
  return {
    recurrence:
      value.recurrence === 'monthly' || value.recurrence === 'yearly' ? value.recurrence : 'none',
    repeatEvery: value.repeatEvery,
    monthBy: value.monthBy,
  }
}

function describe(date: string, value: RepeatValue): string {
  return describeRepeat({
    recurrence: value.recurrence,
    repeatEvery: value.repeatEvery,
    monthBy: value.monthBy,
    startMonth: date.slice(0, 7),
    day: Number(date.slice(8, 10)),
    installments: value.installments === '' ? null : Number(value.installments),
    endMonth: value.endMonth === '' ? null : value.endMonth,
  })
}

type Unit = 'month' | 'year'
type Ends = 'never' | 'until' | 'count'

/** Day of a rule's occurrence in `month`, for the "Termina em" date. */
function dayIn(date: string, rule: RepeatRule) {
  const start = {
    startMonth: date.slice(0, 7),
    day: Number(date.slice(8, 10)),
    monthBy: rule.monthBy,
  }
  return (month: string) => dayByRule(start, month)
}

/**
 * "Recorrência personalizada", like Google Calendar's: every N months or
 * years, the monthly day rule, and the end (never, on a date, after N
 * occurrences). Days and weeks come with the daily/weekly series.
 */
function CustomRepeatDialog({
  open,
  date,
  value,
  onClose,
  onDone,
}: {
  open: boolean
  date: string
  value: RepeatValue
  onClose: () => void
  onDone: (next: RepeatValue) => void
}) {
  const ids = useId()
  const anchor = weekdayAnchor(date)
  const startMonth = date.slice(0, 7)
  const repeating = value.recurrence === 'monthly' || value.recurrence === 'yearly'
  const [every, setEvery] = useState(String(repeating ? value.repeatEvery : 1))
  const [unit, setUnit] = useState<Unit>(value.recurrence === 'yearly' ? 'year' : 'month')
  const [monthBy, setMonthBy] = useState<MonthBy>(repeating ? value.monthBy : 'day')
  const initialRule: RepeatRule = {
    recurrence: unit === 'year' ? 'yearly' : 'monthly',
    repeatEvery: Number(every) || 1,
    monthBy,
  }
  const [ends, setEnds] = useState<Ends>(repeating && value.endMonth !== '' ? 'until' : 'never')
  const [until, setUntil] = useState(() =>
    repeating && value.endMonth !== ''
      ? isoDate(value.endMonth, dayIn(date, initialRule)(value.endMonth))
      : isoDate(endMonthAfter(startMonth, initialRule, 4), Number(date.slice(8, 10))),
  )
  const [count, setCount] = useState(() =>
    repeating && value.endMonth !== ''
      ? String(occurrenceCount(startMonth, initialRule, value.endMonth))
      : '13',
  )
  const [error, setError] = useState<string | null>(null)

  function done() {
    const repeatEvery = Number(every)
    if (!Number.isInteger(repeatEvery) || repeatEvery < 1 || repeatEvery > 99) {
      setError('Repita a cada 1 a 99.')
      return
    }
    const rule: RepeatRule = {
      recurrence: unit === 'year' ? 'yearly' : 'monthly',
      repeatEvery,
      monthBy: unit === 'year' ? 'day' : monthBy,
    }
    let endMonth = ''
    if (ends === 'count') {
      const n = Number(count)
      if (!Number.isInteger(n) || n < 1) {
        setError('Informe quantas vezes.')
        return
      }
      endMonth = endMonthAfter(startMonth, rule, n)
    } else if (ends === 'until') {
      const last = endMonthUntil(startMonth, rule, dayIn(date, rule), until)
      if (last === null) {
        setError('A data final precisa ser depois do início.')
        return
      }
      endMonth = last
    }
    setError(null)
    onDone({ ...value, ...rule, endMonth })
  }

  const monthOptions: { value: MonthBy; label: string }[] = [
    { value: 'day', label: `No dia ${Number(date.slice(8, 10))}` },
    ...(anchor.nth === null
      ? []
      : [{ value: 'weekday' as const, label: presetLabel(date, 'monthly-weekday') }]),
    ...(anchor.last
      ? [{ value: 'last_weekday' as const, label: presetLabel(date, 'monthly-last-weekday') }]
      : []),
  ]

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-xl font-normal">Recorrência personalizada</DialogTitle>
          <DialogDescription className="sr-only">
            Escolha a cada quanto o lançamento se repete e quando termina.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5">
          <div className="flex items-center gap-2">
            <Label htmlFor={`${ids}-every`} className="font-normal">
              Repetir a cada:
            </Label>
            <Input
              id={`${ids}-every`}
              type="number"
              min={1}
              max={99}
              inputMode="numeric"
              className="w-16"
              value={every}
              onChange={(e) => setEvery(e.target.value)}
            />
            <Select
              value={unit}
              onValueChange={(next) => setUnit(next === 'year' ? 'year' : 'month')}
            >
              <SelectTrigger size="sm" aria-label="Unidade" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day" disabled>
                  dia (em breve)
                </SelectItem>
                <SelectItem value="week" disabled>
                  semana (em breve)
                </SelectItem>
                <SelectItem value="month">{Number(every) > 1 ? 'meses' : 'mês'}</SelectItem>
                <SelectItem value="year">{Number(every) > 1 ? 'anos' : 'ano'}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {unit === 'month' && monthOptions.length > 1 && (
            <RadioGroup
              aria-label="Dia do mês"
              value={monthBy}
              onValueChange={(next) => {
                const option = monthOptions.find((o) => o.value === next)
                if (option !== undefined) setMonthBy(option.value)
              }}
            >
              {monthOptions.map((option) => (
                <div key={option.value} className="flex items-center gap-2">
                  <RadioGroupItem id={`${ids}-${option.value}`} value={option.value} />
                  <Label htmlFor={`${ids}-${option.value}`} className="font-normal">
                    {option.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          )}
          <fieldset className="grid gap-3">
            <legend className="mb-2 text-sm">Termina em</legend>
            <RadioGroup
              aria-label="Termina em"
              value={ends}
              onValueChange={(next) =>
                setEnds(next === 'until' || next === 'count' ? next : 'never')
              }
              className="grid gap-3"
            >
              <div className="flex h-9 items-center gap-2">
                <RadioGroupItem id={`${ids}-never`} value="never" />
                <Label htmlFor={`${ids}-never`} className="font-normal">
                  Nunca
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id={`${ids}-until`} value="until" />
                <Label htmlFor={`${ids}-until`} className="w-12 font-normal">
                  Em
                </Label>
                <Input
                  type="date"
                  aria-label="Data final"
                  className="w-40"
                  disabled={ends !== 'until'}
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem id={`${ids}-count`} value="count" />
                <Label htmlFor={`${ids}-count`} className="w-12 font-normal">
                  Após
                </Label>
                <Input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  aria-label="Ocorrências"
                  className="w-20"
                  disabled={ends !== 'count'}
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                />
                <span className="text-muted-foreground text-sm">ocorrências</span>
              </div>
            </RadioGroup>
          </fieldset>
          {error !== null && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" className="rounded-full px-6" onClick={done}>
            Concluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function presetLabel(date: string, id: string): string {
  const label = repeatPresets(date).find((p) => p.id === id)?.label ?? ''
  return label.replace(/^Mensal /, '').replace(/^./, (c) => c.toLocaleUpperCase('pt-BR'))
}
