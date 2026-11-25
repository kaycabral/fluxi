import { afterEach, describe, expect, it, vi } from 'vitest'
import { writeBrowserCookie } from './browser-cookie'

afterEach(() => vi.restoreAllMocks())

describe('writeBrowserCookie', () => {
  it('writes a lax, year-long cookie, Secure on https', () => {
    const set = vi.spyOn(document, 'cookie', 'set')
    writeBrowserCookie('pref', 'a b', { path: '/painel' })
    expect(set).toHaveBeenLastCalledWith('pref=a%20b; Path=/painel; Max-Age=31536000; SameSite=Lax')
    writeBrowserCookie('pref', 'x', { path: '/painel', secure: true })
    expect(set).toHaveBeenLastCalledWith(
      'pref=x; Path=/painel; Max-Age=31536000; SameSite=Lax; Secure',
    )
  })
})
