'use client'

import { setCountFromAction } from '@/features/ledger/adapters/actions/settings'
import { INITIAL_FORM_STATE } from '@/features/ledger/core/action-result'
import type { Month } from '@/features/ledger/core/month'
import { Label } from '@cbrl/design'
import Link from 'next/link'
import { startTransition, useActionState, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { MonthSelect } from './selects'

/** "Contar a partir de": the month balances start accumulating from (saved on change). */
export function CountFromForm({
  value,
  months,
  onSaved,
  showAccountsLink = true,
}: {
  value: Month | null
  months: Month[]
  onSaved?: (m: Month) => void
  /** Point to "Bancos e contas" for the opening balances. */
  showAccountsLink?: boolean
}) {
  const [state, formAction, pending] = useActionState(setCountFromAction, INITIAL_FORM_STATE)
  const [current, setCurrent] = useState(value ?? '')
  useEffect(() => {
    if (state.error !== null) toast.error(state.error)
  }, [state])

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2 text-sm">
      <Label htmlFor="count-from">Contar a partir de</Label>
      <MonthSelect
        id="count-from"
        name="month"
        className="w-28"
        months={months}
        value={current}
        disabled={pending}
        onValueChange={(month) => {
          setCurrent(month)
          onSaved?.(month)
          const formData = new FormData()
          formData.set('month', month)
          startTransition(() => formAction(formData))
        }}
      />
      {showAccountsLink && (
        <span className="text-muted-foreground text-xs">
          saldos iniciais em{' '}
          <Link href="/painel/contas" className="text-primary underline-offset-2 hover:underline">
            Bancos e contas
          </Link>
        </span>
      )}
    </form>
  )
}
