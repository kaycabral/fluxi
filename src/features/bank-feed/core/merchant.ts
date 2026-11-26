import { descriptionKey } from '@/features/ledger/core/similar'

/**
 * Bank descriptions that say how money moved, not where it went ("Compra no
 * débito autorizada"), compared by {@link descriptionKey} (case, accents,
 * digits and punctuation ignored). Kept small and explicit: a bank entry
 * with one of them is named after the merchant Pluggy identified.
 *
 * Mirrored by `private.feed_generic_description` (migration `0025`): keep
 * both in step (the Postgres suite compares them).
 */
export const GENERIC_DESCRIPTIONS = [
  'compra no debito autorizada',
  'compra no debito',
  'compra no credito autorizada',
  'compra no credito',
  'compra aprovada',
  'compra',
  'pagamento',
  'pix',
  'transferencia',
  'bankslip',
  'boleto',
] as const

const GENERIC = new Set<string>(GENERIC_DESCRIPTIONS)

export function isGenericDescription(description: string): boolean {
  return GENERIC.has(descriptionKey(description))
}

/**
 * The description a bank entry gets: the merchant's name when the bank's
 * text is generic, else the bank's text. Mirrored by
 * `private.feed_entry_description`.
 */
export function feedEntryDescription(description: string, merchantName: string | null): string {
  const merchant = merchantName?.trim()
  return merchant && isGenericDescription(description) ? merchant : description
}
