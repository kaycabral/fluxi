import { Unavailable } from '@/app/painel/_components/unavailable'
import { requirePainelScope, todayIso } from '@/app/painel/_lib/session'
import { loadGoals } from '@/features/goals/adapters/goals.repo'
import { GoalsView } from '@/features/goals/ui/goals-view'
import { loadBudgetVersions, loadLedgerData } from '@/features/ledger/adapters/views'
import { Main } from '@cbrl/design'
import type { Metadata } from 'next'
import { connection } from 'next/server'

// @next-codemod-ignore Cache Components adoption: this segment temporarily allows blocking.
// Remove this opt-out after verifying the segment passes validation without it.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

export const metadata: Metadata = { title: 'Objetivos — Fluxi' }

/** `/painel/objetivos`: goals as slices of the `minimum` budget groups (Investimento, Metas). */
export default async function GoalsPage() {
  await connection()
  const scope = await requirePainelScope()
  const today = todayIso()
  const month = today.slice(0, 7)
  const [data, versions, goals] = await Promise.all([
    loadLedgerData(scope, { from: month, to: month }, today),
    loadBudgetVersions(scope),
    loadGoals(scope),
  ])

  return (
    <Main>
      {data.ok && versions.ok && goals.ok ? (
        <GoalsView data={data.data} versions={versions.data} goals={goals.data} today={month} />
      ) : (
        <Unavailable />
      )}
    </Main>
  )
}
