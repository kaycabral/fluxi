import { normalizeName } from './institution'

/**
 * Official logos (Pluggy connector icons, vendored in `public/banks/`) by the
 * names a bank goes by: the user's Fluxi bank names ("BTG", "Nu Empresas")
 * and the feed's institutions/account names ("Itaú Click", "Nu Pagamentos").
 * Most specific first (`btg empresas` before `btg`). Unknown → no logo.
 */
export const BANK_LOGOS: readonly { slug: string; aliases: readonly string[] }[] = [
  { slug: 'btg-empresas', aliases: ['btg pactual empresas', 'btg empresas', 'btg pj'] },
  { slug: 'btg-pactual', aliases: ['btg pactual', 'btg banking', 'btg+', 'btg'] },
  { slug: 'itau', aliases: ['itau unibanco', 'itau empresas', 'itau'] },
  { slug: 'nubank', aliases: ['nu pagamentos', 'nu empresas', 'nubank', 'nu pj', 'nu'] },
  { slug: 'banco-do-brasil', aliases: ['banco do brasil', 'bb'] },
  { slug: 'banrisul', aliases: ['banrisul'] },
  { slug: 'bradesco', aliases: ['bradesco'] },
  { slug: 'c6', aliases: ['c6 bank', 'c6'] },
  { slug: 'caixa', aliases: ['caixa economica', 'caixa', 'cef'] },
  { slug: 'mercado-pago', aliases: ['mercado pago', 'mercadopago'] },
  { slug: 'neon', aliases: ['neon'] },
  { slug: 'pagbank', aliases: ['pagbank', 'pagseguro'] },
  { slug: 'picpay', aliases: ['picpay'] },
  { slug: 'safra', aliases: ['banco safra', 'safra'] },
  { slug: 'santander', aliases: ['santander'] },
  { slug: 'sicredi', aliases: ['sicredi'] },
  { slug: 'xp', aliases: ['xp investimentos', 'xp banking', 'xp'] },
]

function startsWithWord(normalized: string, alias: string): boolean {
  if (!normalized.startsWith(alias)) return false
  const next = normalized.charAt(alias.length)
  return next === '' || !/[a-z0-9]/.test(next) || !/[a-z0-9]$/.test(alias)
}

/** Slug of the logo of a bank/institution name, `undefined` when unknown. */
export function bankLogoSlug(name: string): string | undefined {
  const n = normalizeName(name.trim()).replace(/^banco\s+(?!do brasil)/, '')
  return BANK_LOGOS.find((b) => b.aliases.some((a) => startsWithWord(n, a)))?.slug
}

/** Static path of the logo of a bank/institution name, `undefined` when unknown. */
export function bankLogoSrc(name: string): string | undefined {
  const slug = bankLogoSlug(name)
  return slug === undefined ? undefined : `/banks/${slug}.svg`
}
