'use client'

import { moneyInputDisplay } from '@/features/ledger/core/format'
import { maskBRLInput } from '@cbrl/br/money'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@cbrl/design'
import type * as React from 'react'

type MoneyInputProps = Omit<
  React.ComponentProps<typeof InputGroupInput>,
  'value' | 'onChange' | 'type' | 'inputMode'
> & {
  /** The form's text value (`1.234,56`); shown as the amount it saves. */
  value: string
  onValueChange: (value: string) => void
}

/**
 * Amount in reais with the bank-app mask ({@link maskBRLInput}): the design
 * system's input group with an `R$` prefix, so it sits in a form exactly like
 * every other input.
 */
export function MoneyInput({ value, onValueChange, className, ...props }: MoneyInputProps) {
  return (
    <InputGroup className={className}>
      <InputGroupAddon align="inline-start" className="text-sm">
        R$
      </InputGroupAddon>
      <InputGroupInput
        {...props}
        inputMode="numeric"
        autoComplete="off"
        // The group's border wraps the input: 30px inside keeps it 32px tall, like `Input`.
        className="h-7.5 tabular-nums"
        value={moneyInputDisplay(value)}
        onChange={(e) => onValueChange(maskBRLInput(e.target.value))}
      />
    </InputGroup>
  )
}
