import { describe, expect, it } from 'vitest'
import {
  aliasesOf,
  connectionInstitution,
  feedAccountLabel,
  feedAccountShortLabel,
  institutionColor,
  institutionOf,
  normalizeName,
  withHolderSuffix,
} from './institution'

const bank = (name: string, subtype = 'CHECKING_ACCOUNT') => ({ name, type: 'BANK', subtype })
const card = (name: string) => ({ name, type: 'CREDIT', subtype: 'CREDIT_CARD' })

describe('institutionOf', () => {
  it('recognizes the known institutions', () => {
    expect(institutionOf(['BTG Banking', 'BTG Investimentos', 'BTG Pactual Digital', 'BTG+'])).toBe(
      'BTG Pactual',
    )
    expect(institutionOf(['BTG Empresas', 'BTG Empresas', 'BTG Investimentos'])).toBe(
      'BTG Empresas',
    )
    expect(institutionOf(['itau', 'Itaú Click Múltiplo MC Plat'])).toBe('Itaú')
    expect(institutionOf(['Nu Pagamentos S.A. - Instituição de Pagamento (Conta Pré-paga)'])).toBe(
      'Nubank',
    )
    expect(institutionOf(['NUBANK'])).toBe('Nubank')
  })

  it('falls back to the most frequent first word, never "MeuPluggy"', () => {
    expect(institutionOf(['Inter Conta', 'inter cartão', 'Caixa'])).toBe('Inter')
    expect(institutionOf([])).toBe('Banco')
    expect(institutionOf(['  ', '+'])).toBe('Banco')
  })

  it('does not take a word that merely starts like an alias', () => {
    expect(institutionOf(['Itauna Conta'])).toBe('Itauna')
    expect(institutionOf(['BTGX'])).toBe('Btgx')
  })
})

describe('feedAccountLabel', () => {
  it('prettifies bank accounts', () => {
    expect(feedAccountLabel('Itaú', bank('itau'))).toBe('Itaú · Conta corrente')
    expect(feedAccountLabel('BTG Pactual', bank('BTG Banking'))).toBe(
      'BTG Pactual · Conta corrente',
    )
    expect(feedAccountLabel('BTG Pactual', bank('BTG Pactual Digital'))).toBe(
      'BTG Pactual · Digital',
    )
    expect(feedAccountLabel('BTG Pactual', bank('BTG+'))).toBe('BTG Pactual · Conta corrente')
    expect(feedAccountLabel('BTG Empresas', bank('BTG Empresas'))).toBe(
      'BTG Empresas · Conta corrente',
    )
    expect(
      feedAccountLabel(
        'Nubank',
        bank('Nu Pagamentos S.A. - Instituição de Pagamento (Conta Pré-paga)'),
      ),
    ).toBe('Nubank · Conta')
    expect(feedAccountLabel('Itaú', bank('itau', 'SAVINGS_ACCOUNT'))).toBe('Itaú · Poupança')
    expect(feedAccountLabel('Itaú', bank('itau', 'OTHER'))).toBe('Itaú · Conta')
  })

  it('prettifies cards', () => {
    expect(feedAccountLabel('Itaú', card('Itaú Click Múltiplo MC Plat'))).toBe(
      'Itaú · Cartão Click Múltiplo MC Plat',
    )
    expect(feedAccountLabel('Inter', card('inter cartão'))).toBe('Inter · Cartão')
    expect(feedAccountLabel('Nubank', card('Nubank'))).toBe('Nubank · Cartão')
    expect(feedAccountShortLabel('Itaú', card('Itaú Click'))).toBe('Cartão Click')
    expect(feedAccountLabel('Nubank', card('Nu Pagamentos S.A.'))).toBe('Nubank · Cartão')
    expect(feedAccountLabel('Itaú', bank('Conta Salário'))).toBe('Itaú · Conta Salário')
  })
})

describe('helpers', () => {
  it('normalizes keeping the length', () => {
    expect(normalizeName('Itaú Ç')).toBe('itau c')
    expect(normalizeName('Itaú Ç')).toHaveLength(6)
    expect(aliasesOf('Itaú')).toContain('itau')
    expect(aliasesOf('Inter')).toEqual(['inter'])
  })

  it('colors deterministically', () => {
    expect(institutionColor('Nubank')).toContain('purple')
    expect(institutionColor('Inter')).toBe(institutionColor('Inter'))
    expect(institutionColor('Inter')).toMatch(/^bg-/)
  })
})

describe('connectionInstitution', () => {
  it('names a connection from its accounts, never the proxy connector', () => {
    expect(
      connectionInstitution(['Nu Pagamentos S.A. - Instituição de Pagamento'], 'MeuPluggy'),
    ).toBe('Nubank')
    expect(connectionInstitution([], 'Inter')).toBe('Inter')
    expect(connectionInstitution([], 'MeuPluggy')).toBeNull()
    expect(connectionInstitution([], '  ')).toBeNull()
    expect(connectionInstitution([], null)).toBeNull()
  })
})

describe('holder suffix', () => {
  it('appends "Empresas" when a company holds the accounts', () => {
    expect(institutionOf(['Nubank'], ['company'])).toBe('Nubank Empresas')
    expect(institutionOf(['Nubank', 'Nubank Cartão'], ['person', 'company'])).toBe(
      'Nubank Empresas',
    )
    expect(institutionOf(['Nubank'], ['person'])).toBe('Nubank')
    expect(institutionOf(['Nubank'], [null])).toBe('Nubank')
    expect(institutionOf(['BTG Empresas'], ['company'])).toBe('BTG Empresas')
    expect(withHolderSuffix('Conta Empresas PJ', ['company'])).toBe('Conta Empresas PJ')
    expect(connectionInstitution(['itau'], 'MeuPluggy', ['company'])).toBe('Itaú Empresas')
    expect(connectionInstitution([], 'Inter Empresas', ['company'])).toBe('Inter Empresas')
  })

  it('lets "<base> Empresas" go by its base aliases', () => {
    expect(aliasesOf('Nubank Empresas')).toEqual(
      expect.arrayContaining(['nubank empresas', 'nubank', 'nu pagamentos']),
    )
    expect(aliasesOf('BTG Empresas')).not.toContain('btg')
    expect(
      feedAccountLabel('Nubank Empresas', {
        name: 'Nu Pagamentos S.A.',
        type: 'BANK',
        subtype: 'CHECKING_ACCOUNT',
      }),
    ).toBe('Nubank Empresas · Conta')
  })
})
