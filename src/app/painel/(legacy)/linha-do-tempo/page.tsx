import { Unavailable } from '@/app/painel/_components/unavailable'
import { requirePainelScope, todayIso } from '@/app/painel/_lib/session'
import { loadLedgerData } from '@/features/ledger/adapters/views'
import { timelineWindow } from '@/features/ledger/core/timeline'
import { TimelineView } from '@/features/ledger/ui/timeline-view'
import { Container, PageHeader } from '@cbrl/design'
import { connection } from 'next/server'

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
