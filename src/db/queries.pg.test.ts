import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { fluxiDb, getProfile, seedUser, truncateFluxiTables } from './index'

const USER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

beforeAll(async () => {
  await fluxiDb.migrate()
})

beforeEach(async () => {
  const db = fluxiDb.db()
  await truncateFluxiTables(db)
  await seedUser(db, {
    id: USER,
    email: 'ana@example.com',
    displayName: 'Ana Souza',
    avatarUrl: 'https://example.com/ana.png',
  })
  await seedUser(db, { id: OTHER, email: 'other@example.com' })
})

afterAll(async () => {
  await fluxiDb.close()
})

describe('profiles', () => {
  it('are created by the auth trigger from the Google metadata', async () => {
    await expect(getProfile(USER)).resolves.toEqual({
      id: USER,
      displayName: 'Ana Souza',
      avatarUrl: 'https://example.com/ana.png',
    })
  })

  it('are created even without Google metadata', async () => {
    await expect(getProfile(OTHER)).resolves.toEqual({
      id: OTHER,
      displayName: null,
      avatarUrl: null,
    })
  })

  it('return null for an unknown user', async () => {
    await expect(getProfile('33333333-3333-4333-8333-333333333333')).resolves.toBeNull()
  })

  it('cascade away with the auth user', async () => {
    await fluxiDb.db().execute(sql`delete from auth.users where id = ${USER}`)
    await expect(getProfile(USER)).resolves.toBeNull()
  })
})

describe('row level security', () => {
  it('exposes nothing to the public API roles', async () => {
    const rows = await fluxiDb.db().transaction(async (tx) => {
      await tx.execute(sql`set local role anon`)
      const result = await tx.execute(sql`select count(*)::int as n from profiles`)
      return result.rows
    })
    expect(rows).toEqual([{ n: 0 }])
  })
})
