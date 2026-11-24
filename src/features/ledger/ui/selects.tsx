'use client'

import { bankFilter } from '@/features/ledger/core/account-filter'
import { monthLabel } from '@/features/ledger/core/format'
import { POT_LABELS } from '@/features/ledger/core/labels'
import type { Month } from '@/features/ledger/core/month'
import { POT_KEYS, type Account, type Bank, type Category } from '@/features/ledger/core/types'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@cbrl/design'

/**
 * Selects shared by the views and the entry sheet. Radix refuses an empty item
 * value, so "all"/"none" options use {@link EMPTY} and the components speak
 * `''` to their callers.
 */
export const EMPTY = '__empty__'

const toSelect = (value: string) => (value === '' ? EMPTY : value)
const fromSelect = (value: string) => (value === EMPTY ? '' : value)

type BaseProps = {
  id?: string
  name?: string
  value: string
  onValueChange: (value: string) => void
  'aria-label'?: string
  className?: string
  disabled?: boolean
}

export function AccountSelect({
  banks,
  accounts,
  withBanks = false,
  allLabel,
  placeholder = 'Escolha a conta',
  ...props
}: BaseProps & {
  banks: readonly Bank[]
  accounts: readonly Account[]
  /** Offer `Banco (todas)` options (filters). */
  withBanks?: boolean
  /** Offer an "all accounts" option with this label (filters). */
  allLabel?: string
  placeholder?: string
}) {
  return (
    <Select
      name={props.name}
      value={allLabel === undefined && props.value === '' ? '' : toSelect(props.value)}
      onValueChange={(v) => props.onValueChange(fromSelect(v))}
      disabled={props.disabled}
    >
      <SelectTrigger
        id={props.id}
        aria-label={props['aria-label']}
        className={props.className ?? 'w-full'}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allLabel !== undefined && <SelectItem value={EMPTY}>{allLabel}</SelectItem>}
        {banks.map((bank) => {
          const own = accounts.filter((a) => a.bankId === bank.id)
          if (own.length === 0 && !withBanks) return null
          return (
            <SelectGroup key={bank.id}>
              <SelectLabel>{bank.name}</SelectLabel>
              {withBanks && (
                <SelectItem value={bankFilter(bank.id)}>{bank.name} (todas)</SelectItem>
              )}
              {own.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {bank.name} · {account.name}
                </SelectItem>
              ))}
            </SelectGroup>
          )
        })}
      </SelectContent>
    </Select>
  )
}

/** Categories grouped by group name; `withGroups` adds `Grupo (todas)` (value `g:<group>`). */
export function CategorySelect({
  categories,
  withGroups = false,
  emptyLabel,
  placeholder = 'Escolha…',
  ...props
}: BaseProps & {
  categories: readonly Category[]
  withGroups?: boolean
  emptyLabel?: string
  placeholder?: string
}) {
  const groups = [...new Set(categories.map((c) => c.groupName))]
  return (
    <Select
      name={props.name}
      value={emptyLabel === undefined && props.value === '' ? '' : toSelect(props.value)}
      onValueChange={(v) => props.onValueChange(fromSelect(v))}
      disabled={props.disabled}
    >
      <SelectTrigger
        id={props.id}
        aria-label={props['aria-label']}
        className={props.className ?? 'w-full'}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {emptyLabel !== undefined && <SelectItem value={EMPTY}>{emptyLabel}</SelectItem>}
        {groups.map((group) => (
          <SelectGroup key={group}>
            <SelectLabel>{group}</SelectLabel>
            {withGroups && <SelectItem value={`g:${group}`}>{group} (todas)</SelectItem>}
            {categories
              .filter((c) => c.groupName === group)
              .map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}

export function MonthSelect({ months, ...props }: BaseProps & { months: readonly Month[] }) {
  return (
    <Select
      name={props.name}
      value={props.value}
      onValueChange={props.onValueChange}
      disabled={props.disabled}
    >
      <SelectTrigger
        id={props.id}
        aria-label={props['aria-label']}
        className={props.className ?? 'w-full'}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {months.map((m) => (
          <SelectItem key={m} value={m}>
            {monthLabel(m)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function PotSelect({
  allLabel,
  placeholder = '–',
  ...props
}: BaseProps & { allLabel?: string; placeholder?: string }) {
  return (
    <Select
      name={props.name}
      value={allLabel === undefined && props.value === '' ? '' : toSelect(props.value)}
      onValueChange={(v) => props.onValueChange(fromSelect(v))}
      disabled={props.disabled}
    >
      <SelectTrigger
        id={props.id}
        aria-label={props['aria-label']}
        className={props.className ?? 'w-full'}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {allLabel !== undefined && <SelectItem value={EMPTY}>{allLabel}</SelectItem>}
        {POT_KEYS.map((key) => (
          <SelectItem key={key} value={key}>
            {POT_LABELS[key]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** A plain options select (`[value, label]` pairs; `''` allowed). */
export function OptionSelect({
  options,
  ...props
}: BaseProps & { options: readonly (readonly [string, string])[] }) {
  return (
    <Select
      name={props.name}
      value={toSelect(props.value)}
      onValueChange={(v) => props.onValueChange(fromSelect(v))}
      disabled={props.disabled}
    >
      <SelectTrigger
        id={props.id}
        aria-label={props['aria-label']}
        className={props.className ?? 'w-full'}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([value, label]) => (
          <SelectItem key={value} value={toSelect(value)}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
