import { PageHeader } from '@/app/painel/_components/page-header'
import { Unavailable } from '@/app/painel/_components/unavailable'
import { requirePainelScope, todayIso } from '@/app/painel/_lib/session'
import { Container } from '@/components/container'
import { loadLedgerData } from '@/features/ledger/adapters/views'
import { timelineWindow } from '@/features/ledger/core/timeline'
import { TimelineView } from '@/features/ledger/ui/timeline-view'
import { connection } from 'next/server'

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

export default async function TimelinePage() {
  await connection()
  const scope = await requirePainelScope()
  const day = todayIso()
  const today = day.slice(0, 7)
  const window = timelineWindow(today)
  const data = await loadLedgerData(scope, window, day)

  return (
    <Container className="grid gap-4 px-4 py-5 md:px-6 md:py-8">
      <PageHeader title="Linha do tempo" />
      {data.ok ? <TimelineView data={data.data} window={window} today={today} /> : <Unavailable />}
    </Container>
  )
}
