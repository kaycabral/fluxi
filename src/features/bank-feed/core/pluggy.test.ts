import { describe, expect, it } from 'vitest'
import {
  itemReadiness,
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
  it('signs by type, rounds to cents and drops counterparty data', () => {
    const row = toFeedTransaction(tx())
    expect(row).toEqual({
      externalId: 't1',
      date: '2026-10-14',
      amountCents: -1235,
      description: 'Mercado',
      status: 'POSTED',
      category: null,
      installmentNumber: null,
      totalInstallments: null,
      billMonth: null,
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
