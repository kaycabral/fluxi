/**
 * Who a bank connection is and how its accounts read. Every connection goes
 * through the Meu Pluggy proxy connector, so the item names no institution
 * ("MeuPluggy"): it is derived from its feed accounts' names. The raw names
 * stay stored; these are only for display and for the names of the accounts
 * the auto-link creates.
 *
 * The same rules live in SQL (`private.feed_institution`,
 * `private.feed_account_label`, migration `0022`) for the auto-link; the
 * Postgres suite checks both agree on `INSTITUTION_SAMPLES`.
 */

type InstitutionRule = {
  name: string
  /** Normalized prefixes of the institution's account names, longest first. */
  aliases: readonly string[]
}

/** Known institutions, most specific first (`btg empresas` before `btg`). */
export const INSTITUTION_RULES: readonly InstitutionRule[] = [
  { name: 'BTG Empresas', aliases: ['btg empresas'] },
  { name: 'BTG Pactual', aliases: ['btg pactual', 'btg banking', 'btg+', 'btg'] },
  { name: 'Itaú', aliases: ['itau unibanco', 'itau'] },
  { name: 'Nubank', aliases: ['nu pagamentos', 'nubank'] },
]

const ACCENTS = 'áàâãäéèêëíìîïóòôõöúùûüç'
const PLAIN = 'aaaaaeeeeiiiiooooouuuuc'

/** Lower case without accents; keeps the length (one char for one char), like SQL `translate`. */
export function normalizeName(value: string): string {
  return [...value.toLowerCase()]
    .map((c) => {
      const i = ACCENTS.indexOf(c)
      return i === -1 ? c : PLAIN.charAt(i)
    })
    .join('')
}

function startsWithWord(normalized: string, alias: string): boolean {
  if (!normalized.startsWith(alias)) return false
  const next = normalized.charAt(alias.length)
  return next === '' || !/[a-z0-9]/.test(next) || !/[a-z0-9]$/.test(alias)
}

function ruleOf(name: string): InstitutionRule | undefined {
  const n = normalizeName(name.trim())
  return INSTITUTION_RULES.find((r) => r.aliases.some((a) => startsWithWord(n, a)))
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

const firstWord = (name: string) => name.trim().replace(/\s.*$/s, '')

/**
 * The institution of a connection from its feed accounts' names: the known
 * institution most of them match (ties: rule order); none known → the most
 * frequent first word, capitalized (ties: first seen).
 */
export function institutionOf(names: readonly string[]): string {
  const known = INSTITUTION_RULES.map((rule) => ({
    rule,
    hits: names.filter((n) => ruleOf(n) === rule).length,
  })).filter((k) => k.hits > 0)
  const best = known.reduce<(typeof known)[number] | undefined>(
    (acc, k) => (acc === undefined || k.hits > acc.hits ? k : acc),
    undefined,
  )
  if (best !== undefined) return best.rule.name
  const words = names.map(firstWord).filter((w) => /[\p{L}\p{N}]/u.test(w))
  let top = ''
  let topHits = 0
  for (const w of words) {
    const hits = words.filter((x) => normalizeName(x) === normalizeName(w)).length
    if (hits > topHits) {
      top = w
      topHits = hits
    }
  }
  return top === '' ? 'Banco' : capitalize(top)
}

/**
 * The institution a connection shows: from its accounts' names
 * ({@link institutionOf}), else its label unless that is the proxy
 * connector's ("MeuPluggy"); null when nothing names it. The stored
 * `institution` column is never used: it is always the proxy's name.
 */
export function connectionInstitution(
  accountNames: readonly string[],
  label: string | null,
): string | null {
  if (accountNames.length > 0) return institutionOf(accountNames)
  const trimmed = label?.trim() ?? ''
  return trimmed !== '' && !/pluggy/i.test(trimmed) ? trimmed : null
}

/** Normalized aliases of `institution` (its own name included). */
export function aliasesOf(institution: string): readonly string[] {
  const rule = INSTITUTION_RULES.find((r) => r.name === institution)
  return [...(rule?.aliases ?? []), normalizeName(institution)]
}

const LEGAL = /(^|[^a-z0-9])(s\.?a|ltda|instituicao|pagamento)([^a-z0-9]|$)/

const SUBTYPE_LABELS: Record<string, string> = {
  CHECKING_ACCOUNT: 'Conta corrente',
  SAVINGS_ACCOUNT: 'Poupança',
}

/**
 * "<institution> · <account>": the name without the institution's prefix
 * ("Itaú Click Múltiplo MC Plat" → "Itaú · Cartão Click Múltiplo MC Plat");
 * nothing left → the kind ("itau" → "Itaú · Conta corrente"); a legal name
 * ("Nu Pagamentos S.A. - …") → "Nubank · Conta".
 */
export function feedAccountLabel(
  institution: string,
  feed: { name: string; type: string; subtype: string },
): string {
  const raw = feed.name.trim()
  const n = normalizeName(raw)
  const alias = [...aliasesOf(institution)]
    .sort((a, b) => b.length - a.length)
    .find((a) => startsWithWord(n, a))
  const card = feed.type === 'CREDIT'
  let rest = (alias === undefined ? raw : raw.slice(alias.length))
    .replace(/^[\s\-–·:+|]+/, '')
    .trim()
  // "Inter cartão" → "Inter · Cartão", not "Cartão cartão".
  if (card && /^cartao([^a-z0-9]|$)/.test(normalizeName(rest))) rest = rest.slice(6).trim()
  const kind = card ? 'Cartão' : (SUBTYPE_LABELS[feed.subtype] ?? 'Conta')
  if (rest === '' || !/[\p{L}\p{N}]/u.test(rest)) return `${institution} · ${kind}`
  if (LEGAL.test(normalizeName(rest))) return `${institution} · ${card ? 'Cartão' : 'Conta'}`
  return `${institution} · ${card ? `Cartão ${rest}` : rest}`
}

/** Display name of a feed account without the institution part ("Conta corrente"). */
export function feedAccountShortLabel(
  institution: string,
  feed: { name: string; type: string; subtype: string },
): string {
  const label = feedAccountLabel(institution, feed)
  return label.slice(institution.length + ' · '.length)
}

/** Avatar colors (literal classes so Tailwind sees them). */
export const INSTITUTION_COLORS = [
  'bg-sky-600 text-white',
  'bg-orange-500 text-white',
  'bg-violet-600 text-white',
  'bg-emerald-600 text-white',
  'bg-rose-600 text-white',
  'bg-amber-500 text-black',
  'bg-teal-600 text-white',
  'bg-indigo-600 text-white',
] as const

const KNOWN_COLORS: Record<string, string> = {
  'BTG Pactual': 'bg-blue-900 text-white',
  'BTG Empresas': 'bg-blue-900 text-white',
  Itaú: 'bg-orange-500 text-white',
  Nubank: 'bg-purple-700 text-white',
}

/** Deterministic avatar color of an institution. */
export function institutionColor(institution: string): string {
  const known = KNOWN_COLORS[institution]
  if (known !== undefined) return known
  let hash = 0
  for (const c of normalizeName(institution)) hash = (hash * 31 + c.charCodeAt(0)) >>> 0
  return INSTITUTION_COLORS[hash % INSTITUTION_COLORS.length] ?? 'bg-muted text-foreground'
}

/** Samples both implementations (TS here, SQL in `0022`) must agree on. */
export const INSTITUTION_SAMPLES: readonly {
  names: readonly string[]
  feed: { name: string; type: string; subtype: string }
}[] = [
  {
    names: ['BTG Banking', 'BTG Investimentos', 'BTG Pactual Digital', 'BTG+'],
    feed: { name: 'BTG Banking', type: 'BANK', subtype: 'CHECKING_ACCOUNT' },
  },
  {
    names: ['BTG Banking', 'BTG+'],
    feed: { name: 'BTG+', type: 'BANK', subtype: 'CHECKING_ACCOUNT' },
  },
  {
    names: ['BTG Empresas', 'BTG Empresas', 'BTG Investimentos'],
    feed: { name: 'BTG Empresas', type: 'BANK', subtype: 'CHECKING_ACCOUNT' },
  },
  {
    names: ['itau', 'Itaú Click Múltiplo MC Plat'],
    feed: { name: 'itau', type: 'BANK', subtype: 'CHECKING_ACCOUNT' },
  },
  {
    names: ['itau', 'Itaú Click Múltiplo MC Plat'],
    feed: { name: 'Itaú Click Múltiplo MC Plat', type: 'CREDIT', subtype: 'CREDIT_CARD' },
  },
  {
    names: ['Nu Pagamentos S.A. - Instituição de Pagamento (Conta Pré-paga)'],
    feed: {
      name: 'Nu Pagamentos S.A. - Instituição de Pagamento (Conta Pré-paga)',
      type: 'BANK',
      subtype: 'CHECKING_ACCOUNT',
    },
  },
  {
    names: ['Inter Conta', 'inter cartão', 'Caixa'],
    feed: { name: 'inter cartão', type: 'CREDIT', subtype: 'CREDIT_CARD' },
  },
]
