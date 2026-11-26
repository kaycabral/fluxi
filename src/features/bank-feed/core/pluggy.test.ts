import { describe, expect, it } from 'vitest'
import {
  cardStatusOf,
  companyDocumentOf,
  coveredFrom,
  holderKeyOf,
  holderTypeOf,
  itemReadiness,
  itemStatusOf,
  numberHintOf,
  parsePluggyConfig,
  pluggyIdentitySchema,
  pluggyItemSchema,
  pluggyTransactionSchema,
  spaceNameOf,
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

describe('cardStatusOf', () => {
  it.each([
    ['ACTIVE', 'active'],
    ['BLOCKED', 'blocked'],
    ['CANCELLED', 'cancelled'],
    ['SOMETHING_NEW', null],
    [null, null],
    [undefined, null],
  ] as const)('maps %s to %s', (status, expected) => {
    expect(cardStatusOf(status)).toBe(expected)
  })

  it('keeps the status of a card only', () => {
    const base = { id: 'a', itemId: 'i', subtype: 'X', name: 'N', balance: 1, currencyCode: 'BRL' }
    const card = toFeedAccount(
      { ...base, type: 'CREDIT', creditData: { status: 'BLOCKED' } },
      'Banco X',
    )
    expect(card.cardStatus).toBe('blocked')
    const bank = toFeedAccount(
      { ...base, type: 'BANK', creditData: { status: 'ACTIVE' } },
      'Banco X',
    )
    expect(bank.cardStatus).toBeNull()
  })
})

describe('holder', () => {
  it('derives the holder kind from the document digit count', () => {
    expect(holderTypeOf('123.456.789-09')).toBe('person')
    expect(holderTypeOf('12345678909')).toBe('person')
    expect(holderTypeOf('12.345.678/0001-90')).toBe('company')
    expect(holderTypeOf(' 12345678000190 ')).toBe('company')
    expect(holderTypeOf('***.456.789-**')).toBeNull()
    expect(holderTypeOf('XX.345.678/0001-XX')).toBeNull()
    expect(holderTypeOf('1234')).toBeNull()
    expect(holderTypeOf(null)).toBeNull()
    expect(holderTypeOf(undefined)).toBeNull()
  })

  it('keeps only a company document, as digits', () => {
    expect(companyDocumentOf('12.345.678/0001-90')).toBe('12345678000190')
    expect(companyDocumentOf('123.456.789-09')).toBeNull()
  })

  it('keys a company by an HMAC that is stable, secret-bound and never the CNPJ', async () => {
    const a = await holderKeyOf('12345678000190', 's'.repeat(32))
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(await holderKeyOf('12345678000190', 's'.repeat(32))).toBe(a)
    expect(await holderKeyOf('12345678000190', 't'.repeat(32))).not.toBe(a)
    expect(a).not.toContain('12345678')
  })

  it('maps the holder onto the feed account without the document', () => {
    const base = {
      id: 'a',
      itemId: 'i',
      type: 'BANK' as const,
      subtype: 'CHECKING_ACCOUNT',
      name: 'Nubank',
      balance: 1,
      currencyCode: 'BRL',
    }
    const company = toFeedAccount({ ...base, taxNumber: '12.345.678/0001-90' }, 'X', 'f'.repeat(64))
    expect(company).toMatchObject({ holderType: 'company', holderKey: 'f'.repeat(64) })
    expect(JSON.stringify(company)).not.toContain('345')
    const person = toFeedAccount({ ...base, taxNumber: '123.456.789-09' }, 'X', 'f'.repeat(64))
    expect(person).toMatchObject({ holderType: 'person', holderKey: null })
  })

  it('parses only companyName and documentType of an identity', () => {
    const parsed = pluggyIdentitySchema.parse({
      companyName: 'ACME',
      documentType: 'CNPJ',
      taxNumber: '12.345.678/0001-90',
      fullName: 'Fulano',
    })
    expect(parsed).toEqual({ companyName: 'ACME', documentType: 'CNPJ' })
  })

  it('normalizes a suggested space name to the space limits', () => {
    expect(spaceNameOf('  ACME   Comércio  ')).toBe('ACME Comércio')
    expect(spaceNameOf('   ')).toBeNull()
    expect(spaceNameOf('x'.repeat(50))).toHaveLength(40)
  })
})

describe('itemStatusOf', () => {
  it('keeps codes and dates only, never the error message', () => {
    const item = pluggyItemSchema.parse({
      id: 'i',
      status: 'LOGIN_ERROR',
      executionStatus: 'INVALID_CREDENTIALS',
      lastUpdatedAt: '2026-11-20T09:02:00.000Z',
      nextAutoSyncAt: null,
      consentExpiresAt: 'not a date',
      error: { code: ' INVALID_CREDENTIALS ', message: 'Senha de Maria inválida' },
      connector: { name: 'MeuPluggy', health: { status: 'ONLINE', stage: null } },
    })
    const row = itemStatusOf(item)
    expect(row).toEqual({
      itemStatus: 'LOGIN_ERROR',
      executionStatus: 'INVALID_CREDENTIALS',
      errorCode: 'INVALID_CREDENTIALS',
      lastUpdatedAt: '2026-11-20T09:02:00.000Z',
      nextSyncAt: null,
      consentExpiresAt: null,
      institutionHealth: 'ONLINE',
    })
    expect(JSON.stringify(row)).not.toContain('Maria')
  })

  it('falls back when Pluggy omits fields and caps long codes', () => {
    expect(itemStatusOf({ id: 'i', status: ' ', error: { code: 'X'.repeat(99) } })).toEqual({
      itemStatus: 'UNKNOWN',
      executionStatus: null,
      errorCode: 'X'.repeat(60),
      lastUpdatedAt: null,
      nextSyncAt: null,
      consentExpiresAt: null,
      institutionHealth: null,
    })
  })
})
