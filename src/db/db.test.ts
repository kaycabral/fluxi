// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fluxiDb } from './db'

const LOCAL_URL = 'postgresql://postgres:postgres@127.0.0.1:54422/postgres'

describe('fluxiDb', () => {
  afterEach(async () => {
    await fluxiDb.close()
    vi.unstubAllEnvs()
  })

  it('reuses one client until the pool is closed', async () => {
    vi.stubEnv('POSTGRES_URL', LOCAL_URL)
    const first = fluxiDb.db()
    expect(fluxiDb.db()).toBe(first)
    await fluxiDb.close()
    expect(fluxiDb.db()).not.toBe(first)
  })

  it('opens a pool for a Supabase pooler url carrying sslmode', () => {
    vi.stubEnv(
      'POSTGRES_URL',
      'postgresql://u:p@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require',
    )
    expect(() => fluxiDb.db()).not.toThrow()
  })

  it('fails fast when POSTGRES_URL is unset', () => {
    vi.stubEnv('POSTGRES_URL', '')
    expect(() => fluxiDb.db()).toThrow(/POSTGRES_URL/)
  })
})
