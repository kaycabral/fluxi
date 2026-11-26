import { describe, expect, it } from 'vitest'
import {
  coveredFrom,
  itemReadiness,
  numberHintOf,
  parsePluggyConfig,
  pluggyTransactionSchema,
  toFeedAccount,
  toFeedTransaction,
} from './pluggy'

const tx = (over: Record<string, unknown> = {}) =>
  pluggyTransactionSchema.parse({
    id: 't1',
    accountId: 'a1',
    description: '  Mercado  ',
    amount: -12.345,
    date: '2026-10-14T00:00:00.000Z',
    type: 'DEBIT',
    status: 'POSTED',
    paymentData: { payer: { documentNumber: { type: 'CPF', value: '000' } } },
    ...over,
  })

describe('toFeedTransaction', () => {
  it('keeps the merchant name (trade name first) and category, never its CNPJ', () => {
    const merchant = {
      name: ' Padaria Pão ',
      businessName: 'PADARIA PAO LTDA',
      cnpj: '12.345.678/0001-90',
      cnae: '1091102',
      category: 'Bakery',
    }
    const row = toFeedTransaction(tx({ merchant }))
    expect(row).toMatchObject({ merchantName: 'Padaria Pão', merchantCategory: 'Bakery' })
    expect(JSON.stringify(row)).not.toContain('12.345.678')
    expect(toFeedTransaction(tx({ merchant: { ...merchant, name: '  ' } })).merchantName).toBe(
      'PADARIA PAO LTDA',
    )
    expect(toFeedTransaction(tx({ merchant: null })).merchantName).toBeNull()
  })

  it('signs by type, rounds to cents and drops counterparty data', () => {
    const row = toFeedTransaction(tx())
    expect(row).toEqual({
      externalId: 't1',
      date: '2026-10-14',
      amountCents: -1235,
      description: 'Mercado',
      status: 'POSTED',
      category: null,
      operationType: null,
      installmentNumber: null,
      totalInstallments: null,
      billMonth: null,
      merchantName: null,
      merchantCategory: null,
    })
    expect(JSON.stringify(row)).not.toContain('CPF')
  })

  it('treats a positive card purchase as an outflow and keeps installments', () => {
    const row = toFeedTransaction(
      tx({
        amount: 50,
        status: undefined,
        category: 'Shopping',
        creditCardMetadata: {
          installmentNumber: 2,
          totalInstallments: 3,
          billForecastDate: '2026-11',
        },
      }),
    )
    expect(row).toMatchObject({
      amountCents: -5000,
      status: 'POSTED',
      category: 'Shopping',
      installmentNumber: 2,
      totalInstallments: 3,
      billMonth: '2026-11-01',
    })
  })

  it('uses the amount in the account currency and ignores malformed bill months', () => {
    const row = toFeedTransaction(
      tx({
        type: 'CREDIT',
        amount: 10,
        amountInAccountCurrency: 55.5,
        creditCardMetadata: { billForecastDate: 'soon' },
      }),
    )
    expect(row.amountCents).toBe(5550)
    expect(row.billMonth).toBeNull()
  })

  it('keeps the Open Finance operation type, a transfer signal', () => {
    expect(toFeedTransaction(tx({ operationType: ' PAGAMENTO_FATURA ' })).operationType).toBe(
      'PAGAMENTO_FATURA',
    )
    expect(toFeedTransaction(tx({ operationType: '' })).operationType).toBeNull()
  })
})

describe('toFeedAccount', () => {
  const base = {
    id: 'a1',
    itemId: 'i1',
    type: 'BANK' as const,
    subtype: 'CHECKING_ACCOUNT',
    name: 'Conta Corrente',
    balance: 1234.56,
    currencyCode: 'BRL',
  }
  it('prefers the marketing name and keeps the balance sign', () => {
    expect(toFeedAccount({ ...base, marketingName: ' Gold ' }, 'Banco X')).toMatchObject({
      name: 'Gold',
      institution: 'Banco X',
      balanceCents: 123456,
    })
    expect(toFeedAccount({ ...base, balance: -10 }, 'Banco X')).toMatchObject({
      name: 'Conta Corrente',
      balanceCents: -1000,
    })
  })
})

describe('itemReadiness', () => {
  it('is ready only when UPDATED', () => {
    expect(itemReadiness({ id: 'i', status: 'UPDATED' })).toEqual({
      ready: true,
      reason: 'UPDATED',
    })
    expect(
      itemReadiness({ id: 'i', status: 'UPDATING', executionStatus: 'TRANSACTIONS_IN_PROGRESS' }),
    ).toEqual({
      ready: false,
      reason: 'UPDATING (TRANSACTIONS_IN_PROGRESS)',
    })
    expect(itemReadiness({ id: 'i', status: 'LOGIN_ERROR' }).reason).toBe('LOGIN_ERROR')
  })
})

describe('parsePluggyConfig', () => {
  const file =
    '# comment\nPLUGGY_CLIENT_ID=file-id\nPLUGGY_CLIENT_SECRET=file-secret\nPLUGGY_ITEM_IDS= a, b ,,\nbroken\n'
  it('reads the file and lets the environment win', () => {
    expect(parsePluggyConfig(file, {})).toEqual({
      clientId: 'file-id',
      clientSecret: 'file-secret',
      itemIds: ['a', 'b'],
    })
    expect(parsePluggyConfig(file, { PLUGGY_CLIENT_ID: 'env-id' }).clientId).toBe('env-id')
  })
  it('names every missing key without echoing values', () => {
    expect(() => parsePluggyConfig('PLUGGY_CLIENT_SECRET=s', {})).toThrow(
      'missing PLUGGY_CLIENT_ID, PLUGGY_ITEM_IDS',
    )
  })
})

describe('coveredFrom', () => {
  it('starts 360 days before today, across years', () => {
    expect(coveredFrom('2026-11-25')).toBe('2025-11-30')
    expect(coveredFrom('2026-01-10')).toBe('2025-01-15')
  })
})

describe('numberHintOf', () => {
  it.each([
    ['0001/12345-0', '3450'],
    ['0001/1234821', '4821'],
    ['12.345-6', '3456'],
    ['4821', '4821'],
    ['XXXX XXXX XXXX 4821', '4821'],
    ['123', null],
    ['', null],
    [null, null],
    [undefined, null],
  ])('%s → %s', (number, hint) => {
    expect(numberHintOf(number)).toBe(hint)
  })

  it('is what toFeedAccount keeps, never the full number', () => {
    const account = toFeedAccount(
      {
        id: 'a',
        itemId: 'i',
        type: 'BANK',
        subtype: 'CHECKING_ACCOUNT',
        name: 'Conta',
        number: '0001/9876543-2',
        balance: 1,
        currencyCode: 'BRL',
      },
      'Banco X',
    )
    expect(account.numberHint).toBe('5432')
    expect(JSON.stringify(account)).not.toContain('9876543')
  })
})
