import 'server-only'

import { SPACE_COOKIE } from '@/features/spaces/core/space'
import { getServerUser } from '@/lib/auth/server'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { resolveScope, type ServerScope } from './space.repo'

export type { ServerScope } from './space.repo'

/**
 * The scope of this request: the verified session user and the active space.
 * The `fluxi_space` cookie is only a hint, resolved against the user's own
 * active spaces; missing, archived, foreign or malformed ids fall back to the
 * personal space. Null when signed out. Deduped per request.
 */
export const getServerScope = cache(async (): Promise<ServerScope | null> => {
  const user = await getServerUser()
  if (!user) return null
  return resolveScope(user.id, (await cookies()).get(SPACE_COOKIE)?.value)
})
