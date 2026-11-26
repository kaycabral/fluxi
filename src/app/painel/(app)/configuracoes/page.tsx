import { PageHeader } from '@/app/painel/_components/page-header'
import { Unavailable } from '@/app/painel/_components/unavailable'
import { requirePainelScope } from '@/app/painel/_lib/session'
import { listFeedItems } from '@/features/spaces/adapters/space.repo'
import { BankConnections } from '@/features/spaces/ui/bank-connections'
import { readBackend } from '@/lib/backend-read'
import { Main } from '@cbrl/design'
import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Configurações — Fluxi' }

/**
 * `/painel/configuracoes`: account-wide settings, reached from the user menu.
 * One section per subject (`#conexoes`: the bank connections and the space
 * each one syncs into).
 */
export default async function SettingsPage() {
  const scope = await requirePainelScope()
  const connections = await readBackend('bank connections', () => listFeedItems(scope.userId))
  return (
    <Main width="narrow">
      <div className="grid gap-4">
        <PageHeader title="Configurações" />
        <section id="conexoes" aria-label="Conexões" className="scroll-mt-4">
          {connections.ok ? (
            <BankConnections connections={connections.data} spaces={scope.spaces} />
          ) : (
            <Unavailable />
          )}
        </section>
      </div>
    </Main>
  )
}
