import { describe, expect, it } from 'vitest'
import { popupSide } from './context'

const box = (left: number, width: number) => new DOMRect(left, 100, width, 20)

describe('popupSide', () => {
  it('opens beside an anchor with room on its right', () => {
    expect(popupSide(box(100, 150), 1440)).toBe('right')
  })

  it('opens beside an anchor with room only on its left (Radix flips it)', () => {
    expect(popupSide(box(1250, 150), 1440)).toBe('right')
  })

  it('opens below an anchor as wide as the screen (day view, schedule)', () => {
    expect(popupSide(box(260, 1160), 1440)).toBe('bottom')
  })

  it('opens below a phone month cell, where the popup takes the whole width', () => {
    expect(popupSide(box(160, 53), 375)).toBe('bottom')
  })
})
