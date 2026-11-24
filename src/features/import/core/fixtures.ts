import type { LedgerItem } from './items'
import type { NotionPage, NotionSource } from './notion'
import type { TxRecord } from './records'

/**
 * Synthetic Notion pages and records for the import tests (never real data).
 * Property builders mirror the Notion API value shapes.
 */

export const prop = {
  title: (text: string) => ({ type: 'title', title: [{ plain_text: text }] }),
  number: (value: number | null) => ({ type: 'number', number: value }),
  select: (name: string | null) => ({ type: 'select', select: name === null ? null : { name } }),
  multi: (...names: string[]) => ({
    type: 'multi_select',
    multi_select: names.map((name) => ({ name })),
  }),
  relation: (...ids: string[]) => ({ type: 'relation', relation: ids.map((id) => ({ id })) }),
  date: (start: string | null) => ({ type: 'date', date: start === null ? null : { start } }),
  checkbox: (value: boolean) => ({ type: 'checkbox', checkbox: value }),
}

export function page(id: string, properties: Record<string, unknown>): NotionPage {
  return { id, properties }
}

export type TxInput = {
  description?: string
  amount?: number | null
  movement?: 'Inflow' | 'Outflow' | null
  account?: string
  month?: string | null
  due?: string | null
  date?: string | null
  type?: string | null
  category?: string[]
  tags?: string[]
  ignored?: boolean
}

/** A transaction page; `month` is the id of a month page (see {@link monthPage}). */
export function txPage(id: string, input: TxInput = {}): NotionPage {
  return page(id, {
    Description: prop.title(input.description ?? 'Aluguel'),
    Amount: prop.number(input.amount === undefined ? 100 : input.amount),
    Movement: prop.select(input.movement === undefined ? 'Outflow' : input.movement),
    Account: prop.relation(...(input.account === undefined ? ['acc-1'] : [input.account])),
    Month: prop.relation(
      ...(input.month === undefined || input.month === null ? [] : [input.month]),
    ),
    Due: prop.date(input.due ?? null),
    Date: prop.date(input.date ?? null),
    Type: prop.select(input.type ?? null),
    Category: prop.multi(...(input.category ?? [])),
    Tags: prop.multi(...(input.tags ?? [])),
    Ignored: prop.checkbox(input.ignored ?? false),
  })
}

/** Month page keyed `m-YYYY-MM`, with a Duration starting on the 1st. */
export function monthPage(month: string): NotionPage {
  return page(`m-${month}`, { Name: prop.title('Any'), Duration: prop.date(`${month}-01`) })
}

export function record(overrides: Partial<TxRecord> = {}): TxRecord {
  return {
    externalId: 'tx',
    month: '2026-01',
    day: 10,
    amountCents: 10000,
    movement: 'Outflow',
    accountId: 'acc-1',
    description: 'Aluguel',
    descriptionKey: 'aluguel',
    group: 'Moradia',
    subCategory: 'Pagamento de aluguel',
    type: 'Essential',
    tags: [],
    paidOn: null,
    ...overrides,
  }
}

export function item(overrides: Partial<LedgerItem> = {}): LedgerItem {
  return {
    kind: 'expense',
    month: '2026-01',
    day: 10,
    amountCents: 10000,
    accountId: 'acc-1',
    toAccountId: null,
    description: 'Aluguel',
    descriptionKey: 'aluguel',
    group: 'Moradia',
    subCategory: 'Pagamento de aluguel',
    type: 'Essential',
    tags: [],
    paidOn: null,
    externalIds: ['tx'],
    ...overrides,
  }
}

const MONTHS = ['2025-01', '2025-02', '2025-03', '2025-04', '2026-01', '2027-01']

export function source(transactions: NotionSource['transactions']): NotionSource {
  return {
    banks: [
      page('bank-1', { Name: prop.title('Banco A'), Status: prop.select('Active') }),
      page('bank-2', { Name: prop.title('Banco B'), Status: prop.select('Inactive') }),
    ],
    accounts: [
      page('acc-1', {
        Name: prop.title('Corrente'),
        Type: prop.select('Checking'),
        Status: prop.select('Active'),
        Bank: prop.relation('bank-1'),
      }),
      page('acc-2', {
        Name: prop.title('Cartão'),
        Type: prop.select('Credit'),
        Status: prop.select('Inactive'),
        Bank: prop.relation('bank-2'),
      }),
    ],
    months: MONTHS.map(monthPage),
    years: [],
    transactions,
  }
}

const rent = (month: string, patch: Parameters<typeof txPage>[1] = {}) =>
  txPage(`rent-${month}`, {
    description: 'Aluguel',
    amount: 1500,
    month: `m-${month}`,
    due: `${month}-05`,
    type: 'Essential',
    category: ['🏠 Moradia', 'Pagamento de aluguel'],
    ...patch,
  })

const transfer = (id: string, movement: 'Inflow' | 'Outflow', account: string) =>
  txPage(id, {
    description: 'Reserva',
    amount: 300,
    movement,
    account,
    month: 'm-2025-02',
    due: '2025-02-10',
    category: ['🔁 Transferências', 'Mesma titularidade'],
  })

/** A small synthetic workspace: a monthly rent with gap/overrides, a yearly tax, a salary, a negative refund, a transfer pair and skipped rows. */
export const workspace = source([
  rent('2025-01', { date: '2025-01-05' }),
  rent('2025-02', { amount: 1600 }),
  rent('2025-04', { due: '2025-04-08' }),
  txPage('ipva-1', {
    description: 'IPVA',
    amount: 900,
    month: 'm-2025-01',
    type: 'Essential',
    category: ['🚐 Transporte', 'IPVA e licenciamento'],
  }),
  txPage('ipva-2', {
    description: 'IPVA',
    amount: 900,
    month: 'm-2026-01',
    type: 'Essential',
    category: ['🚐 Transporte', 'IPVA e licenciamento'],
  }),
  txPage('ipva-3', {
    description: 'IPVA',
    amount: 950,
    month: 'm-2027-01',
    type: 'Essential',
    category: ['🚐 Transporte', 'IPVA e licenciamento'],
  }),
  txPage('salary', {
    description: 'Salário',
    amount: 5000,
    movement: 'Inflow',
    month: 'm-2025-01',
    type: 'Essential',
    category: ['💵 Renda', 'Salário'],
    date: '2025-01-30',
  }),
  txPage('refund', { description: 'Estorno', amount: -40, month: 'm-2025-03', account: 'acc-2' }),
  transfer('tr-out', 'Outflow', 'acc-1'),
  transfer('tr-in', 'Inflow', 'acc-2'),
  txPage('ignored', { ignored: true, month: 'm-2025-01' }),
  txPage('incomplete', { amount: null, month: 'm-2025-01' }),
  txPage('loose', { month: null }),
])
