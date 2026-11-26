import { PageHeader } from '@/app/painel/_components/page-header'
import { Unavailable } from '@/app/painel/_components/unavailable'
import { requirePainelScope, todayIso } from '@/app/painel/_lib/session'
import { Container } from '@/components/container'
import { loadAccountBalances, loadRefs } from '@/features/ledger/adapters/views'
import { addMonths } from '@/features/ledger/core/month'
import { AccountsView } from '@/features/ledger/ui/accounts-view'
import { listFeedItems } from '@/features/spaces/adapters/space.repo'
import { BankConnections } from '@/features/spaces/ui/bank-connections'
import { readBackend } from '@/lib/backend-read'
import type { Metadata } from 'next'
import { randomUUID } from 'node:crypto'

export const metadata: Metadata = { title: 'Bancos e contas — Fluxi' }

export default async function AccountsPage() {
  const scope = await requirePainelScope()
  const today = todayIso()
  const refs = await loadRefs(scope, today)
  const first = today.slice(0, 7)
  const balances = await loadAccountBalances(scope, first, addMonths(first, 12))
  const connections = await readBackend('bank connections', () => listFeedItems(scope.userId))

  return (
    <Container className="grid gap-4 px-4 py-5 md:px-6 md:py-8">
      <PageHeader title="Bancos e contas" />
      {refs.ok && balances.ok ? (
        <AccountsView
          banks={refs.data.banks}
          accounts={refs.data.accounts}
          {...balances.data}
          newBankId={randomUUID()}
          newAccountId={randomUUID()}
        />
      ) : (
        <Unavailable />
      )}
      {connections.ok && <BankConnections connections={connections.data} spaces={scope.spaces} />}
    </Container>
  )
}
