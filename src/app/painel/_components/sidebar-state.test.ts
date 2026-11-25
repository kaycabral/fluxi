import { describe, expect, it } from 'vitest'
import { sidebarOpenFrom } from './sidebar-state'

describe('sidebarOpenFrom', () => {
  it('collapses only when the cookie says so', () => {
    expect(sidebarOpenFrom('collapsed')).toBe(false)
    expect(sidebarOpenFrom('open')).toBe(true)
    expect(sidebarOpenFrom(undefined)).toBe(true)
    expect(sidebarOpenFrom('nope')).toBe(true)
  })
})
