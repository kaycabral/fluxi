import { PageHeader } from '@/app/painel/_components/page-header'
import { Unavailable } from '@/app/painel/_components/unavailable'
import { requirePainelScope, todayIso } from '@/app/painel/_lib/session'
import { Container } from '@/components/container'
import { loadLedgerData } from '@/features/ledger/adapters/views'
import { timelineWindow } from '@/features/ledger/core/timeline'
import { TimelineView } from '@/features/ledger/ui/timeline-view'

export default async function TimelinePage() {
  const scope = await requirePainelScope()
  const today = todayIso().slice(0, 7)
  const window = timelineWindow(today)
  const data = await loadLedgerData(scope, window)

  return (
    <Container className="grid gap-4 px-4 py-5 md:px-6 md:py-8">
      <PageHeader title="Linha do tempo" />
      {data.ok ? <TimelineView data={data.data} window={window} today={today} /> : <Unavailable />}
    </Container>
  )
}
