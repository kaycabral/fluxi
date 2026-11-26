import { DEFAULT_POTS } from '@/features/ledger/core/defaults'
import { makeEntry, salarySplit } from '@/features/ledger/core/fixtures'
import type { Pot } from '@/features/ledger/core/types'
import type { LedgerData, LedgerRefs } from '@/features/ledger/core/view'

/** The 6 default pots, as the database seeds them. */
export function samplePots(): Pot[] {
  return DEFAULT_POTS.map(({ key, name, color, goal }, sort) => ({
    key,
    name,
    color,
    goal,
    sort,
    archived: false,
  }))
}

/** Sample ledger for the UI tests (ids are UUIDs so the form schemas accept them). */
export const IDS = {
  btg: '00000000-0000-4000-8000-0000000000b1',
  nu: '00000000-0000-4000-8000-0000000000b2',
  cc: '00000000-0000-4000-8000-0000000000a1',
  card: '00000000-0000-4000-8000-0000000000a2',
  nucc: '00000000-0000-4000-8000-0000000000a3',
  old: '00000000-0000-4000-8000-0000000000a4',
  salaryCat: '00000000-0000-4000-8000-0000000000c1',
  powerCat: '00000000-0000-4000-8000-0000000000c2',
  gymCat: '00000000-0000-4000-8000-0000000000c3',
  salary: '00000000-0000-4000-8000-0000000000e1',
  power: '00000000-0000-4000-8000-0000000000e2',
  once: '00000000-0000-4000-8000-0000000000e3',
  transfer: '00000000-0000-4000-8000-0000000000e4',
  buffet: '00000000-0000-4000-8000-0000000000e5',
  flash: '00000000-0000-4000-8000-0000000000b3',
  va: '00000000-0000-4000-8000-0000000000a5',
  voucher: '00000000-0000-4000-8000-0000000000e6',
  market: '00000000-0000-4000-8000-0000000000e7',
} as const

export function sampleData(overrides: Partial<LedgerData> = {}): LedgerData {
  return {
    banks: [
      { id: IDS.btg, name: 'BTG', sort: 0, archived: false },
      { id: IDS.nu, name: 'Nubank', sort: 1, archived: false },
    ],
    accounts: [
      {
        id: IDS.cc,
        bankId: IDS.btg,
        name: 'Conta',
        type: 'checking',
        // R$ 1.000,00 on Dec 1st: Sep–Nov move +R$ 1.220,00 before it.
        openingBalanceCents: -22000,
        archived: false,
      },
      {
        id: IDS.card,
        bankId: IDS.btg,
        name: 'Cartão',
        type: 'credit',
        openingBalanceCents: 0,
        archived: false,
      },
      {
        id: IDS.nucc,
        bankId: IDS.nu,
        name: 'Conta Nu',
        type: 'checking',
        openingBalanceCents: 20000,
        archived: false,
      },
      {
        id: IDS.old,
        bankId: IDS.nu,
        name: 'Antiga',
        type: 'investment',
        openingBalanceCents: 0,
        archived: true,
      },
    ],
    categories: [
      { id: IDS.salaryCat, groupName: 'Renda', name: 'Salário', defaultPot: null, archived: false },
      {
        id: IDS.powerCat,
        groupName: 'Contas',
        name: 'Energia elétrica',
        defaultPot: 'essential',
        archived: false,
      },
      {
        id: IDS.gymCat,
        groupName: 'Esportes',
        name: 'Academia',
        defaultPot: 'comfort',
        archived: false,
      },
    ],
    pots: samplePots(),
    entries: [
      makeEntry({
        id: IDS.salary,
        kind: 'income',
        description: 'Salário',
        amountCents: 500000,
        accountId: IDS.cc,
        categoryId: IDS.salaryCat,
        pot: null,
        startMonth: '2026-11',
        tags: ['trabalho'],
      }),
      makeEntry({
        id: IDS.power,
        description: 'Luz',
        amountCents: -26000,
        day: 15,
        accountId: IDS.cc,
        categoryId: IDS.powerCat,
        pot: 'essential',
        startMonth: '2026-09',
        tags: ['casa'],
      }),
      makeEntry({
        id: IDS.once,
        description: 'Avulso',
        amountCents: -700000,
        day: 3,
        accountId: IDS.cc,
        pot: 'variable',
        recurrence: 'none',
        startMonth: '2026-12',
      }),
      makeEntry({
        id: IDS.transfer,
        kind: 'transfer',
        description: 'Para o Nubank',
        amountCents: -40000,
        day: 6,
        accountId: IDS.cc,
        toAccountId: IDS.nucc,
        pot: null,
        startMonth: '2026-12',
      }),
      makeEntry({
        id: IDS.buffet,
        description: 'Buffet',
        amountCents: -3000000,
        day: 25,
        accountId: IDS.cc,
        pot: 'comfort',
        recurrence: 'installments',
        installments: 12,
        startMonth: '2026-12',
      }),
    ],
    parts: salarySplit(IDS.salary),
    overrides: [],
    payments: [],
    feed: { connectedAccountIds: [], bankEntryIds: [], today: '2026-12-15' },
    ...overrides,
  }
}

/** {@link sampleData} plus a benefit account (VA at "Flash") with a monthly credit and spending. */
export function sampleDataWithBenefit(): LedgerData {
  const data = sampleData()
  return {
    ...data,
    banks: [...data.banks, { id: IDS.flash, name: 'Flash', sort: 2, archived: false }],
    accounts: [
      ...data.accounts,
      {
        id: IDS.va,
        bankId: IDS.flash,
        name: 'VA',
        type: 'benefit',
        openingBalanceCents: 30000,
        archived: false,
      },
    ],
    entries: [
      ...data.entries,
      makeEntry({
        id: IDS.voucher,
        kind: 'income',
        description: 'Crédito VA',
        amountCents: 80000,
        day: 1,
        accountId: IDS.va,
        pot: null,
        startMonth: '2026-12',
      }),
      makeEntry({
        id: IDS.market,
        description: 'Mercado VA',
        amountCents: -20000,
        day: 16,
        accountId: IDS.va,
        pot: 'essential',
        startMonth: '2026-12',
      }),
    ],
  }
}

export function sampleRefs(overrides: Partial<LedgerRefs> = {}): LedgerRefs {
  const data = sampleData()
  return {
    banks: data.banks,
    accounts: data.accounts,
    categories: data.categories,
    pots: data.pots,
    tags: ['casa', 'viagem'],
    today: '2026-12-15',
    ...overrides,
  }
}
