import { describe, expect, it } from 'vitest'
import { page, prop, source, txPage, workspace } from './fixtures'
import type { NotionSource } from './notion'
import { buildImportPlan, expectedFlows, planAsLedger, verifyPlan } from './plan'
import { verifyLedger } from './verify'

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
      mirrorsDropped: 0,
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
      amountCents: -150000,
      day: 5,
      startMonth: '2025-01',
      endMonth: '2025-04',
    })
    expect(rentEntry?.overrides).toEqual([
      { month: '2025-02', amountCents: -160000, day: null, skipped: false },
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
    // Signed from the source account: a transfer always leaves it.
    expect(reserve?.amountCents).toBeLessThan(0)
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

describe('buildImportPlan with benefit mirrors', () => {
  const base = source([])
  const va = page('acc-va', {
    Name: prop.title('VA'),
    Type: prop.select('Benefit'),
    Status: prop.select('Active'),
    Bank: prop.relation('bank-1'),
  })
  const tx = (id: string, movement: 'Inflow' | 'Outflow', month: string, extra = {}) =>
    txPage(id, {
      description: movement === 'Inflow' ? 'Crédito VA' : 'Uso VA',
      amount: 800,
      movement,
      account: 'acc-va',
      month: null,
      due: `${month}-01`,
      ...extra,
    })
  const months = ['2026-11', '2026-12', '2027-01', '2027-02', '2027-03']
  const workspaceWithBenefit: NotionSource = {
    ...base,
    accounts: [...base.accounts, va],
    transactions: [
      ...months.map((m) => tx(`in-${m}`, 'Inflow', m)),
      tx('out-2026-11', 'Outflow', '2026-11'),
      tx('out-2026-12', 'Outflow', '2026-12', { date: '2026-12-01' }),
      tx('out-2027-01', 'Outflow', '2027-01'),
      tx('out-2027-02', 'Outflow', '2027-02', { amount: 700 }),
      tx('out-2027-03', 'Outflow', '2027-03'),
    ],
  }
  const plan = buildImportPlan(workspaceWithBenefit)

  it('drops only the unpaid future mirrors and reports how many', () => {
    expect(plan.stats.mirrorsDropped).toBe(2)
    expect(plan.droppedExternalIds).toEqual(['out-2027-01', 'out-2027-03'])
    expect(plan.links.map((l) => l.externalId)).not.toContain('out-2027-01')
    expect(expectedFlows(plan)).toHaveLength(plan.originals.length - 2)
  })

  it('rebuilds the mirror series from what is left (gap skipped, trimmed end)', () => {
    const outflows = plan.entries.filter((e) => e.kind === 'expense')
    expect(outflows).toHaveLength(1)
    expect(outflows[0]).toMatchObject({ startMonth: '2026-11', endMonth: '2027-02' })
    expect(outflows[0]?.overrides).toEqual([
      { month: '2027-01', amountCents: null, day: null, skipped: true },
      { month: '2027-02', amountCents: -70000, day: null, skipped: false },
    ])
  })

  it('verifies against the originals minus the dropped set, never silently', () => {
    expect(verifyPlan(plan).divergences).toBe(0)
    expect(verifyLedger(plan.originals, planAsLedger(plan)).divergences).toBe(2)
  })

  it('keeps every mirror before the count start', () => {
    expect(
      buildImportPlan(workspaceWithBenefit, { countFrom: '2028-01' }).stats.mirrorsDropped,
    ).toBe(0)
  })
})
