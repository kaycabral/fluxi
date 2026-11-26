import { PageHeader } from '@/app/painel/_components/page-header'
import { Unavailable } from '@/app/painel/_components/unavailable'
import { requirePainelScope } from '@/app/painel/_lib/session'
import { listFeedItems } from '@/features/spaces/adapters/space.repo'
import { BankConnections } from '@/features/spaces/ui/bank-connections'
import { readBackend } from '@/lib/backend-read'
import { Main } from '@cbrl/design'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Conexões bancárias — Fluxi' }

/** `/painel/conexoes`: the user's bank connections and the space each one syncs into. */
export default async function ConnectionsPage() {
  const scope = await requirePainelScope()
  const connections = await readBackend('bank connections', () => listFeedItems(scope.userId))
  return (
    <Main>
      <div className="grid gap-4">
        <PageHeader title="Conexões bancárias" />
        {connections.ok ? (
          <BankConnections connections={connections.data} spaces={scope.spaces} />
        ) : (
          <Unavailable />
        )}
      </div>
    </Main>
  )
}
