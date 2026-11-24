import { fluxiDb } from '@/db/db'
import { profiles } from '@/db/schema'
import { eq } from 'drizzle-orm'

export type Profile = {
  id: string
  displayName: string | null
  avatarUrl: string | null
}

export async function getProfile(id: string): Promise<Profile | null> {
  const [row] = await fluxiDb
    .db()
    .select({
      id: profiles.id,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
    })
    .from(profiles)
    .where(eq(profiles.id, id))
    .limit(1)
  return row ?? null
}
