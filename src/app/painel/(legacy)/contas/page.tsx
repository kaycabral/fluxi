import { PageHeader } from '@/app/painel/_components/page-header'
import { Unavailable } from '@/app/painel/_components/unavailable'
import { requirePainelUser, todayIso } from '@/app/painel/_lib/session'
import { Container } from '@/components/container'
import { loadAccountBalances, loadCountFrom, loadRefs } from '@/features/ledger/adapters/views'
import { addMonths } from '@/features/ledger/core/month'
import { AccountsView } from '@/features/ledger/ui/accounts-view'
import type { Metadata } from 'next'
import { randomUUID } from 'node:crypto'

export const metadata: Metadata = { title: 'Bancos e contas — Fluxi' }

export default async function AccountsPage() {
  const user = await requirePainelUser()
  const today = todayIso()
  const [refs, countFrom] = await Promise.all([loadRefs(user.id, today), loadCountFrom(user.id)])
  const first = countFrom.ok && countFrom.data !== null ? countFrom.data : today.slice(0, 7)
  const balances = await loadAccountBalances(user.id, first, addMonths(first, 12))

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
    </Container>
  )
}
