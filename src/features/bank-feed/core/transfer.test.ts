import { describe, expect, it } from 'vitest'
import { hasStrongTransferSignal, isTransferPair, TRANSFER_SIGNAL_EXAMPLES } from './transfer'

describe('isTransferPair', () => {
  it.each(TRANSFER_SIGNAL_EXAMPLES)('$label → $pair', ({ a, b, pair }) => {
    expect(isTransferPair(a, b)).toBe(pair)
    expect(isTransferPair(b, a)).toBe(pair)
  })

  it('never pairs two plain transfers without a strong signal', () => {
    const pix = { category: 'Transfer - PIX', operationType: 'PIX' }
    expect(isTransferPair(pix, pix)).toBe(false)
  })
})

describe('hasStrongTransferSignal', () => {
  it('takes the bill payment operation alone', () => {
    expect(hasStrongTransferSignal({ category: null, operationType: 'PAGAMENTO_FATURA' })).toBe(
      true,
    )
    expect(hasStrongTransferSignal({ category: 'Transfers', operationType: 'PIX' })).toBe(false)
  })
})
