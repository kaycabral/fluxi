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
        mirrorsDropped: 0,
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

  it('says how many benefit mirrors were dropped from the comparison', () => {
    const lines = formatReport({
      stats: {
        transactions: 2,
        skipped: { ignored: 0, incomplete: 0, noMonth: 0 },
        importable: 2,
        negativeFlipped: 0,
        zeroOnlyRuns: 0,
        transfersPaired: 0,
        mirrorsDropped: 3,
        entriesByRecurrence: { none: 1, monthly: 0, yearly: 0 },
        valueOrDayOverrides: 0,
        skippedMonths: 0,
      },
      counts: { banks: 1, accounts: 1, archivedAccounts: 0, payments: 0 },
      categories: { toCreate: 0, reused: 0 },
      verification: { byYear: [], byAccount: [], divergences: 0 },
      accountLabel: (id) => id,
    })
    expect(lines.join('\n')).toContain('espelhos de benefício fora:  3')
    expect(lines.at(-1)).toBe(
      'Divergências (mês × conta × movimento): 0 (Notion menos 3 espelho(s) descartado(s))',
    )
  })
})
