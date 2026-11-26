// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BANK_LOGOS, bankLogoSlug, bankLogoSrc } from './logo'

const DIR = join(process.cwd(), 'public', 'banks')

describe('bankLogoSlug', () => {
  it.each([
    ['BTG', 'btg-pactual'],
    ['BTG Pactual', 'btg-pactual'],
    ['BTG+', 'btg-pactual'],
    ['BTG Banking', 'btg-pactual'],
    ['BTG Empresas', 'btg-empresas'],
    ['btg empresas conta', 'btg-empresas'],
    ['Itaú', 'itau'],
    ['ITAU Click Múltiplo MC Plat', 'itau'],
    ['Itaú Empresas', 'itau'],
    ['Nubank', 'nubank'],
    ['Nu Empresas', 'nubank'],
    ['Nu Pagamentos S.A. - Instituição de Pagamento (Conta Pré-paga)', 'nubank'],
    ['Banco do Brasil', 'banco-do-brasil'],
    ['Banco Inter', undefined],
    ['Banco Safra', 'safra'],
    ['Caixa Econômica Federal', 'caixa'],
    ['Mercado Pago', 'mercado-pago'],
    ['C6 Bank', 'c6'],
    ['XP', 'xp'],
  ])('%s → %s', (name, slug) => {
    expect(bankLogoSlug(name)).toBe(slug)
  })

  it('does not match a prefix inside a word', () => {
    expect(bankLogoSlug('Nuvem')).toBeUndefined()
    expect(bankLogoSlug('Neonatal')).toBeUndefined()
    expect(bankLogoSlug('Carteira')).toBeUndefined()
    expect(bankLogoSlug('')).toBeUndefined()
  })

  it('builds the static path', () => {
    expect(bankLogoSrc('Itaú')).toBe('/banks/itau.svg')
    expect(bankLogoSrc('Vale Alimentação')).toBeUndefined()
  })
})

describe('public/banks', () => {
  it('has one file per slug', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.svg'))
    expect(files.toSorted()).toEqual(BANK_LOGOS.map((b) => `${b.slug}.svg`).toSorted())
  })

  it('holds only inert SVGs (no scripts, handlers or external references)', () => {
    for (const { slug } of BANK_LOGOS) {
      const svg = readFileSync(join(DIR, `${slug}.svg`), 'utf8')
      expect(svg.trimStart().startsWith('<svg') || svg.trimStart().startsWith('<?xml')).toBe(true)
      expect(svg).not.toMatch(
        /<script|<foreignObject|\son[a-z]+\s*=|javascript:|(?:href|src)="(?:https?:)?\/\//i,
      )
    }
  })
})
