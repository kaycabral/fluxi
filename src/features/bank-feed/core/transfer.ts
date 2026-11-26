/**
 * When two opposite bank transactions are ONE transfer between the user's own
 * accounts. Only the institution's own signal counts: a matching amount on
 * another account within a few days is not evidence (a debit-card purchase and
 * an unrelated PIX of the same value paired that way in production).
 *
 * A pair qualifies when at least one side carries a STRONG signal (Pluggy's
 * card bill payment / same-person transfer category, or the Open Finance
 * operation `PAGAMENTO_FATURA`) and the other side is strong too or is itself
 * a transfer (category `Transfers` or `Transfer - …`: e.g. the bank slip that
 * pays the card bill). Purchases, income, investments never pair.
 *
 * Mirrored by `private.feed_transfer_pair` (migration `0024`); the Postgres
 * suite checks both agree on {@link TRANSFER_SIGNAL_EXAMPLES}.
 */

export type TransferSignalInput = {
  category: string | null
  operationType: string | null
}

const STRONG_CATEGORIES = new Set([
  'Credit card payment',
  'Same person transfer',
  'Same person transfer - CASH',
])

export function hasStrongTransferSignal({ category, operationType }: TransferSignalInput): boolean {
  return (
    operationType === 'PAGAMENTO_FATURA' || (category !== null && STRONG_CATEGORIES.has(category))
  )
}

function isTransferCategory(category: string | null): boolean {
  return category === 'Transfers' || (category?.startsWith('Transfer - ') ?? false)
}

function supports(side: TransferSignalInput): boolean {
  return hasStrongTransferSignal(side) || isTransferCategory(side.category)
}

/** Whether the two sides (in any order) may become one transfer. */
export function isTransferPair(a: TransferSignalInput, b: TransferSignalInput): boolean {
  return (hasStrongTransferSignal(a) && supports(b)) || (hasStrongTransferSignal(b) && supports(a))
}

const side = (category: string | null, operationType: string | null): TransferSignalInput => ({
  category,
  operationType,
})

/** Real category/operation combinations seen in production, with the verdict. */
export const TRANSFER_SIGNAL_EXAMPLES: readonly {
  label: string
  a: TransferSignalInput
  b: TransferSignalInput
  pair: boolean
}[] = [
  {
    label: 'Pix paying the card bill',
    a: side('Credit card payment', 'PAGAMENTO_FATURA'),
    b: side('Same person transfer', 'PIX'),
    pair: true,
  },
  {
    label: 'Bank slip paying the card bill',
    a: side('Transfer - Bank Slip', 'BOLETO'),
    b: side('Credit card payment', 'PAGAMENTO_FATURA'),
    pair: true,
  },
  {
    label: 'Card bill payment on both sides',
    a: side('Credit card payment', 'PAGAMENTO_FATURA'),
    b: side('Credit card payment', 'OUTROS'),
    pair: true,
  },
  {
    label: 'Same person transfer, cash',
    a: side('Same person transfer - CASH', null),
    b: side('Same person transfer', 'TED'),
    pair: true,
  },
  {
    label: 'Interest reversal vs cash deposit',
    a: side('Proceeds interests and dividends', 'RESGATE_APLIC_FINANCEIRA'),
    b: side('Transfer - Cash', 'DEPOSITO'),
    pair: false,
  },
  {
    label: 'Debit purchase vs PIX',
    a: side('Shopping', 'CARTAO'),
    b: side('Transfer - PIX', 'PIX'),
    pair: false,
  },
  {
    label: 'PIX vs card purchase',
    a: side('Transfers', 'PIX'),
    b: side('Shopping', 'CARTAO'),
    pair: false,
  },
  {
    label: 'Bakery purchase vs PIX',
    a: side('Shopping', 'CARTAO'),
    b: side('Transfers', 'PIX'),
    pair: false,
  },
  {
    label: 'Strong signal vs purchase',
    a: side('Same person transfer', 'PIX'),
    b: side('Shopping', 'CARTAO'),
    pair: false,
  },
  {
    label: 'No category at all',
    a: side(null, null),
    b: side(null, null),
    pair: false,
  },
]
