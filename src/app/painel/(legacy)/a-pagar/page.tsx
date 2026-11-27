import { PageHeader } from '@/app/painel/_components/page-header'
import { Unavailable } from '@/app/painel/_components/unavailable'
import { requirePainelScope, todayIso } from '@/app/painel/_lib/session'
import { Container } from '@/components/container'
import { loadLedgerData } from '@/features/ledger/adapters/views'
import { payablesWindow } from '@/features/ledger/core/payments'
import { PayablesView } from '@/features/ledger/ui/payables-view'
import type { Metadata } from 'next'
import { connection } from 'next/server'

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

export const metadata: Metadata = { title: 'A pagar — Fluxi' }

export default async function PayablesPage() {
  await connection()
  const scope = await requirePainelScope()
  // The user's local date (São Paulo; no per-user time zone yet).
  const today = todayIso()
  const window = payablesWindow(today.slice(0, 7))
  const data = await loadLedgerData(scope, window, today)

  return (
    <Container className="grid gap-4 px-4 py-5 md:px-6 md:py-8">
      <PageHeader title="A pagar" />
      {data.ok ? <PayablesView data={data.data} window={window} today={today} /> : <Unavailable />}
    </Container>
  )
}
