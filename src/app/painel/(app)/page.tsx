import { Unavailable } from '@/app/painel/_components/unavailable'
import { requirePainelUser, todayIso } from '@/app/painel/_lib/session'
import { loadCountFrom, loadLedgerData } from '@/features/ledger/adapters/views'
import { CALENDAR_PREFS_COOKIE, parseCalendarPrefs } from '@/features/ledger/core/calendar-prefs'
import { viewFromSlug, viewMonths } from '@/features/ledger/core/calendar-views'
import { isoDaySchema, monthSchema } from '@/features/ledger/core/schemas'
import { CalendarView } from '@/features/ledger/ui/calendar-view'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'

export const metadata: Metadata = { title: 'Calendário — Fluxi' }

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ''
}

/** `?data=`, else the 1st of an old `?mes=` link, else today. */
function dateOf(params: Record<string, string | string[] | undefined>, today: string): string {
  const parsedDate = isoDaySchema.safeParse(first(params.data))
  if (parsedDate.success) return parsedDate.data
  const parsedMonth = monthSchema.safeParse(first(params.mes))
  return parsedMonth.success ? `${parsedMonth.data}-01` : today
}

/**
 * `/painel`: the calendar, main view of the app. `?modo=` picks the view (else
 * the last one used, from the prefs cookie), `?data=` the day it shows (old
 * `?mes=` links still work), `?conta=` the account filter.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const user = await requirePainelUser()
  const params = await searchParams
  const today = todayIso()
  const prefs = parseCalendarPrefs((await cookies()).get(CALENDAR_PREFS_COOKIE)?.value)
  const view = viewFromSlug(first(params.modo)) ?? prefs.view
  const date = dateOf(params, today)
  const account = first(params.conta).slice(0, 80)
  const countFrom = await loadCountFrom(user.id)
  const data = countFrom.ok
    ? await loadLedgerData(user.id, viewMonths(view, date), countFrom.data)
    : null

  return data?.ok === true ? (
    <CalendarView
      data={data.data}
      view={view}
      date={date}
      account={account}
      today={today}
      prefs={{ ...prefs, view }}
    />
  ) : (
    <main className="p-6">
      <Unavailable />
    </main>
  )
}
