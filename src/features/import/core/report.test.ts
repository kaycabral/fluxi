import { describe, expect, it } from 'vitest'
import { formatReport } from './report'

describe('formatReport', () => {
  it('prints aggregates and flags diverging rows', () => {
    const lines = formatReport({
      stats: {
        transactions: 10,
        skipped: { ignored: 1, incomplete: 2, noMonth: 3 },
        importable: 4,
        negativeFlipped: 1,
        zeroOnlyRuns: 0,
        transfersPaired: 1,
        entriesByRecurrence: { none: 1, monthly: 2, yearly: 3 },
        valueOrDayOverrides: 5,
        skippedMonths: 6,
      },
      counts: { banks: 2, accounts: 3, archivedAccounts: 1, payments: 7 },
      categories: { toCreate: 1, reused: 2 },
      verification: {
        byYear: [
          {
            key: '2026',
            notion: { inflowCents: 100, outflowCents: 0 },
            fluxi: { inflowCents: 100, outflowCents: 0 },
          },
        ],
        byAccount: [
          {
            key: 'acc',
            notion: { inflowCents: 100, outflowCents: 0 },
            fluxi: { inflowCents: 0, outflowCents: 0 },
          },
        ],
        divergences: 1,
      },
      accountLabel: (id) => `#1 ${id}`,
    })
    const text = lines.join('\n')
    expect(text).toContain('lançamentos:                 6 (mensal 2, anual 3, único 1)')
    expect(text).toContain('categorias:                  1 novas, 2 reaproveitadas')
    expect(text).toMatch(/2026 .*sim/)
    expect(text).toMatch(/#1 acc .*NÃO/)
    expect(lines.at(-1)).toBe('Divergências (mês × conta × movimento): 1')
  })
})
