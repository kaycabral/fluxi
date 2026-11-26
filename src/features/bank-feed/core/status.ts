import type { CardStatus } from './pluggy'

/**
 * What "Conexões" can truthfully say about a feed account: Pluggy has no
 * active/closed flag for bank accounts, so only the latest stored movement
 * (the feed keeps a 12-month window) and, for cards, the status Pluggy reports.
 */

export const CARD_STATUS_LABELS: Record<CardStatus, string> = {
  active: 'Cartão ativo',
  blocked: 'Cartão bloqueado',
  cancelled: 'Cartão cancelado',
}

/** `YYYY-MM-DD` → `dd/mm/aaaa`. */
export function brDate(iso: string): string {
  const [year, month, day] = iso.slice(0, 10).split('-')
  return `${day}/${month}/${year}`
}

/** "Último movimento: 03/11/2026" or "Sem movimento nos últimos 12 meses". */
export function lastMovementLabel(lastMovement: string | null): string {
  return lastMovement === null
    ? 'Sem movimento nos últimos 12 meses'
    : `Último movimento: ${brDate(lastMovement)}`
}

/** The secondary status line: card status (when known) and the latest movement. */
export function feedAccountStatusLine(feed: {
  lastMovement: string | null
  cardStatus?: CardStatus | null
}): string {
  const parts = [lastMovementLabel(feed.lastMovement)]
  if (feed.cardStatus) parts.unshift(CARD_STATUS_LABELS[feed.cardStatus])
  return parts.join(' · ')
}
