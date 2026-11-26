import { describe, expect, it } from 'vitest'
import { feedEntryDescription, isGenericDescription } from './merchant'

describe('isGenericDescription', () => {
  it.each([
    'Compra no débito autorizada',
    'COMPRA NO DEBITO AUTORIZADA',
    'Compra no crédito',
    'Compra aprovada 12/03',
    'Pagamento',
    'PIX',
    'Transferência',
    'Bankslip',
  ])('%s is generic', (description) => {
    expect(isGenericDescription(description)).toBe(true)
  })

  it.each(['Padaria São João', 'Pix enviado Maria', 'Pagamento de fatura', ''])(
    '%s is not generic',
    (description) => {
      expect(isGenericDescription(description)).toBe(false)
    },
  )
})

describe('feedEntryDescription', () => {
  it('names a generic description after the merchant', () => {
    expect(feedEntryDescription('Compra no débito autorizada', ' Padaria Pão ')).toBe('Padaria Pão')
  })

  it('keeps the bank text without a merchant or when it is specific', () => {
    expect(feedEntryDescription('Compra no débito autorizada', null)).toBe(
      'Compra no débito autorizada',
    )
    expect(feedEntryDescription('Compra no débito autorizada', '  ')).toBe(
      'Compra no débito autorizada',
    )
    expect(feedEntryDescription('UBER *TRIP', 'Uber')).toBe('UBER *TRIP')
  })
})
