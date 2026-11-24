// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { assertTestDatabaseUrl, testDatabaseUrl } from './test-database'

describe('testDatabaseUrl', () => {
  it.each(['localhost', '127.0.0.1', 'postgres'])(
    'points the local host %s at fluxi_test',
    (host) => {
      expect(testDatabaseUrl(`postgresql://postgres:postgres@${host}:54422/postgres`)).toBe(
        `postgresql://postgres:postgres@${host}:54422/fluxi_test`,
      )
    },
  )

  it('refuses a Supabase host', () => {
    expect(() =>
      testDatabaseUrl('postgresql://u:p@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'),
    ).toThrow(/non-local/)
  })
})

describe('assertTestDatabaseUrl', () => {
  it('accepts the local test database', () => {
    expect(() =>
      assertTestDatabaseUrl('postgresql://postgres:postgres@127.0.0.1:54422/fluxi_test'),
    ).not.toThrow()
  })

  it('refuses the local dev database', () => {
    expect(() =>
      assertTestDatabaseUrl('postgresql://postgres:postgres@127.0.0.1:54422/postgres'),
    ).toThrow(/outside fluxi_test \(127\.0\.0\.1\/postgres\)/)
  })

  it('refuses a remote database named fluxi_test', () => {
    expect(() =>
      assertTestDatabaseUrl('postgresql://u:p@db.example.supabase.co:5432/fluxi_test'),
    ).toThrow(/outside fluxi_test/)
  })

  it.each([undefined, ''])('refuses when the url is unset (%s)', (raw) => {
    expect(() => assertTestDatabaseUrl(raw)).toThrow(/\(unset\)/)
  })
})
