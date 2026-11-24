import { describe, expect, it } from 'vitest'
import { page, prop, source, txPage, workspace } from './fixtures'
import type { NotionSource } from './notion'
import { buildImportPlan, planAsLedger, verifyPlan } from './plan'

describe('buildImportPlan', () => {
  const plan = buildImportPlan(workspace)

  it('maps banks and accounts, archiving inactive ones', () => {
    expect(plan.banks).toEqual([
      { externalId: 'bank-1', name: 'Banco A', archived: false, sort: 0 },
      { externalId: 'bank-2', name: 'Banco B', archived: true, sort: 1 },
    ])
    expect(plan.accounts.map((a) => [a.externalId, a.bankExternalId, a.type, a.archived])).toEqual([
      ['acc-1', 'bank-1', 'checking', false],
      ['acc-2', 'bank-2', 'credit', true],
    ])
  })

  it('reports the aggregate stats', () => {
    expect(plan.stats).toEqual({
      transactions: 13,
      skipped: { ignored: 1, incomplete: 1, noMonth: 1 },
      importable: 10,
      negativeFlipped: 1,
      zeroOnlyRuns: 0,
      transfersPaired: 1,
      entriesByRecurrence: { none: 3, monthly: 1, yearly: 1 },
      valueOrDayOverrides: 3,
      skippedMonths: 1,
    })
  })

  it('builds entries with pots for expenses only, categories and overrides', () => {
    const rentEntry = plan.entries.find((e) => e.description === 'Aluguel')
    expect(rentEntry).toMatchObject({
      kind: 'expense',
      pot: 'essential',
      recurrence: 'monthly',
      amountCents: 150000,
      day: 5,
      startMonth: '2025-01',
      endMonth: '2025-04',
    })
    expect(rentEntry?.overrides).toEqual([
      { month: '2025-02', amountCents: 160000, day: null, skipped: false },
      { month: '2025-03', amountCents: null, day: null, skipped: true },
      { month: '2025-04', amountCents: null, day: 8, skipped: false },
    ])
    const salary = plan.entries.find((e) => e.description === 'Salário')
    expect(salary).toMatchObject({ kind: 'income', pot: null })
    const refund = plan.entries.find((e) => e.description === 'Estorno')
    expect(refund).toMatchObject({ kind: 'income', amountCents: 4000, categoryKey: null })
    const reserve = plan.entries.find((e) => e.description === 'Reserva')
    expect(reserve).toMatchObject({
      kind: 'transfer',
      accountId: 'acc-1',
      toAccountId: 'acc-2',
      pot: null,
      categoryKey: null,
    })
    expect(plan.categories.map((c) => [c.groupName, c.name, c.defaultPot])).toEqual([
      ['Moradia', 'Pagamento de aluguel', 'essential'],
      ['Transporte', 'IPVA e licenciamento', 'essential'],
      ['Renda', 'Salário', null],
    ])
  })

  it('records payments from Date and links every imported row', () => {
    expect(plan.payments.map((p) => [p.month, p.paidOn])).toEqual([
      ['2025-01', '2025-01-05'],
      ['2025-01', '2025-01-30'],
    ])
    expect(plan.links.map((l) => l.externalId).sort()).toEqual(
      [
        'ipva-1',
        'ipva-2',
        'ipva-3',
        'refund',
        'rent-2025-01',
        'rent-2025-02',
        'rent-2025-04',
        'salary',
        'tr-in',
        'tr-out',
      ].sort(),
    )
  })

  it('re-expands to exactly the Notion originals', () => {
    const verification = verifyPlan(plan)
    expect(verification.divergences).toBe(0)
    expect(verification.byYear.map((r) => r.key)).toEqual(['2025', '2026', '2027'])
    expect(verification.byYear[0]?.fluxi).toEqual({
      inflowCents: 5000_00 + 40_00 + 300_00,
      outflowCents: 1500_00 + 1600_00 + 1500_00 + 900_00 + 300_00,
    })
    expect(planAsLedger(plan).overrides).toHaveLength(4)
  })

  it('refuses unmappable accounts', () => {
    const broken = (accounts: NotionSource['accounts']) => ({ ...workspace, accounts })
    expect(() =>
      buildImportPlan(
        broken([page('acc-1', { Name: prop.title('X'), Type: prop.select('Checking') })]),
      ),
    ).toThrow(/no known bank/)
    expect(() =>
      buildImportPlan(
        broken([
          page('acc-1', {
            Name: prop.title('X'),
            Type: prop.select('Weird'),
            Bank: prop.relation('bank-1'),
          }),
        ]),
      ),
    ).toThrow(/unknown type/)
    expect(() =>
      buildImportPlan(source([txPage('t', { account: 'nope', month: 'm-2025-01' })])),
    ).toThrow(/unknown account/)
  })
})
