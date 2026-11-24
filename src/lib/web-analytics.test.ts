import { describe, expect, it } from 'vitest'
import { redactAnalyticsEvent, redactAnalyticsUrl } from './web-analytics'

const ORIGIN = 'https://fluxi.example'

describe('redactAnalyticsUrl', () => {
  it('drops the query string and the fragment', () => {
    expect(redactAnalyticsUrl(`${ORIGIN}/painel?mes=2026-11#saldo`)).toBe(`${ORIGIN}/painel`)
  })

  it('drops the OAuth code from the auth callback', () => {
    expect(redactAnalyticsUrl(`${ORIGIN}/auth/callback?code=abc&next=%2Fpainel`)).toBe(
      `${ORIGIN}/auth/callback`,
    )
  })

  it('returns null for an unparseable url', () => {
    expect(redactAnalyticsUrl('not a url')).toBeNull()
  })
})

describe('redactAnalyticsEvent', () => {
  it('rewrites the url and keeps the event type', () => {
    expect(redactAnalyticsEvent({ type: 'pageview', url: `${ORIGIN}/painel?x=1` })).toEqual({
      type: 'pageview',
      url: `${ORIGIN}/painel`,
    })
  })

  it('drops the event when the url cannot be parsed', () => {
    expect(redactAnalyticsEvent({ type: 'event', url: '::' })).toBeNull()
  })
})
