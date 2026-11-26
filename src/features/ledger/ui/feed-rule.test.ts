import { groupPayables } from '@/features/ledger/core/payments'
import { projectWindow } from '@/features/ledger/core/view'
import { describe, expect, it } from 'vitest'
import { sampleData } from './test-fixtures'

describe('projectWindow with a bank-fed account', () => {
  const data = sampleData()
  const checking = data.accounts[0]?.id ?? ''
  const connected = sampleData({
    feed: { connectedAccountIds: [checking], today: '2026-12-15' },
  })
  const touches = (accountId: string | null) => accountId === checking
  const pastOnChecking = (results: ReturnType<typeof projectWindow>) =>
    results
      .flatMap((m) => m.landings)
      .filter((l) => `${l.month}-${String(l.day).padStart(2, '0')}` <= '2026-12-15')
      .filter((l) => touches(l.entry.accountId) || touches(l.entry.toAccountId))

  it('hides planned past occurrences of the connected account, not the future ones', () => {
    expect(pastOnChecking(projectWindow(data, '2026-09', '2026-12')).length).toBeGreaterThan(0)
    expect(pastOnChecking(projectWindow(connected, '2026-09', '2026-12'))).toEqual([])
    const after = projectWindow(connected, '2027-01', '2027-01').flatMap((m) => m.landings)
    expect(after.some((l) => touches(l.entry.accountId))).toBe(true)
  })

  it('never lists them as overdue in "A pagar"', () => {
    const landings = projectWindow(connected, '2025-12', '2027-01').flatMap((m) => m.landings)
    const overdue = groupPayables(landings, [], '2026-12-15').find((g) => g.key === 'overdue')
    expect(overdue?.items.filter((i) => touches(i.landing.entry.accountId)) ?? []).toEqual([])
  })
})
