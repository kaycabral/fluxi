/**
 * "Categorize once, replicate": which bank entries look like the one the user
 * just categorized, and which of them to preselect.
 *
 * Similar = same {@link descriptionKey} (case, accents, digits and
 * punctuation ignored: "ATM VENEZA 0412" ≡ "Atm Veneza"). Only bank
 * entries are candidates: they are the bulk that arrives uncategorized, and
 * a planned or recurring entry is already described on purpose.
 */

const ACCENTED = 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ'
const PLAIN = 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'

/**
 * The normalized description. Mirrored by `private.description_key` (migration
 * `0024`), which applies the categorization rules: keep both in step (the
 * Postgres suite compares them).
 */
export function descriptionKey(description: string): string {
  let plain = ''
  for (const char of description) {
    const at = ACCENTED.indexOf(char)
    plain += at === -1 ? char : PLAIN.charAt(at)
  }
  return plain
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim()
}

/** Within [0.5×, 2×] of the edited entry's absolute amount. */
export function isSimilarAmount(referenceCents: number, candidateCents: number): boolean {
  const ref = Math.abs(referenceCents)
  const value = Math.abs(candidateCents)
  return value * 2 >= ref && value <= ref * 2
}

export type SimilarCandidate = {
  id: string
  description: string
  /** `YYYY-MM-DD`. */
  date: string
  accountId: string
  amountCents: number
  categoryId: string | null
  pot: string | null
}

/** The reference entry and the bank entries that look like it. */
export type SimilarResult = {
  reference: { id: string; amountCents: number; description: string }
  candidates: SimilarCandidate[]
}

/**
 * Preselected: a similar amount AND nothing classified yet. A candidate that
 * already has a category or pot is never overwritten unless the user checks
 * it; a far amount (the supermarket among the bakery's coffees) neither.
 */
export function isPreselected(referenceCents: number, candidate: SimilarCandidate): boolean {
  return (
    isSimilarAmount(referenceCents, candidate.amountCents) &&
    candidate.categoryId === null &&
    candidate.pot === null
  )
}

/** The rule's range: the absolute amounts of the reference and the checked items. */
export function ruleRange(amounts: readonly number[]): { minCents: number; maxCents: number } {
  const values = amounts.map((a) => Math.abs(a))
  return { minCents: Math.min(...values), maxCents: Math.max(...values) }
}

/** A categorization rule as Configurações → Regras lists it. */
export type CategorizationRule = {
  id: string
  /** {@link descriptionKey} it matches. */
  pattern: string
  minCents: number
  maxCents: number
  categoryId: string | null
  categoryName: string | null
  pot: string | null
  potName: string | null
}
