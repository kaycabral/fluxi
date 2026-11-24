import { PageHeader } from '@/app/painel/_components/page-header'
import { Unavailable } from '@/app/painel/_components/unavailable'
import { requirePainelUser, todayIso } from '@/app/painel/_lib/session'
import { Container } from '@/components/container'
import { loadCountFrom, loadLedgerData } from '@/features/ledger/adapters/views'
import { payablesWindow } from '@/features/ledger/core/payments'
import { PayablesView } from '@/features/ledger/ui/payables-view'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'A pagar — Fluxi' }

export default async function PayablesPage() {
  const user = await requirePainelUser()
  // The user's local date (São Paulo; no per-user time zone yet).
  const today = todayIso()
  const countFrom = await loadCountFrom(user.id)
  const window = countFrom.ok ? payablesWindow(countFrom.data, today.slice(0, 7)) : null
  const data =
    countFrom.ok && window !== null ? await loadLedgerData(user.id, window, countFrom.data) : null

  return (
    <Container className="grid gap-4 px-4 py-5 md:px-6 md:py-8">
      <PageHeader title="A pagar" />
      {data?.ok === true && window !== null ? (
        <PayablesView data={data.data} window={window} today={today} />
      ) : (
        <Unavailable />
      )}
    </Container>
  )
}
