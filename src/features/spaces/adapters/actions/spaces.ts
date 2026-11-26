'use server'

import { SESSION_EXPIRED, type ActionResult } from '@/features/ledger/core/action-result'
import { firstIssue } from '@/features/ledger/core/schemas'
import {
  archiveSpace,
  assignFeedItem,
  createSpace,
  listFeedItems,
  listSpaces,
  resolveScope,
  type FeedItem,
} from '@/features/spaces/adapters/space.repo'
import {
  assignFeedItemSchema,
  createSpaceSchema,
  SPACE_COOKIE,
  spaceIdSchema,
  type Space,
} from '@/features/spaces/core/space'
import { getServerUser } from '@/lib/auth/server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { randomUUID } from 'node:crypto'

/**
 * Space actions (switcher, "Novo espaço…", archive, bank connections). Inputs
 * are `unknown` (public POST endpoints) and re-validated; the user always comes
 * from the session and every space id is matched against the user's own.
 */

const NOT_FOUND: ActionResult = { ok: false, error: 'Espaço não encontrado.' }

async function rememberSpace(spaceId: string | null): Promise<void> {
  const store = await cookies()
  if (spaceId === null) {
    store.delete({ name: SPACE_COOKIE, path: '/' })
    return
  }
  store.set(SPACE_COOKIE, spaceId, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  })
}

function refreshed(): ActionResult {
  revalidatePath('/painel', 'layout')
  return { ok: true }
}

/** Make one of the user's active spaces the current one. */
export async function switchSpaceAction(input: unknown): Promise<ActionResult> {
  const user = await getServerUser()
  if (!user) return { ok: false, error: SESSION_EXPIRED }
  const parsed = spaceIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const scope = await resolveScope(user.id, parsed.data)
  if (scope.spaceId !== parsed.data) return NOT_FOUND
  await rememberSpace(scope.spaceId)
  return refreshed()
}

/** Create a business space (seeded with the default pots, plan and categories) and switch to it. */
export async function createSpaceAction(input: unknown): Promise<ActionResult> {
  const user = await getServerUser()
  if (!user) return { ok: false, error: SESSION_EXPIRED }
  const parsed = createSpaceSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const id = randomUUID()
  await createSpace(user.id, { id, ...parsed.data })
  await rememberSpace(id)
  return refreshed()
}

/** Archive a business space (hidden, data kept); back to the personal space if it was current. */
export async function archiveSpaceAction(input: unknown): Promise<ActionResult> {
  const user = await getServerUser()
  if (!user) return { ok: false, error: SESSION_EXPIRED }
  const parsed = spaceIdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  if (!(await archiveSpace(user.id, parsed.data))) return NOT_FOUND
  const current = (await cookies()).get(SPACE_COOKIE)?.value
  if (current === parsed.data) await rememberSpace(null)
  return refreshed()
}

/** Route a bank connection to one of the user's spaces (null = stop syncing it). */
export async function assignFeedItemAction(input: unknown): Promise<ActionResult> {
  const user = await getServerUser()
  if (!user) return { ok: false, error: SESSION_EXPIRED }
  const parsed = assignFeedItemSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) }
  const { itemId, spaceId } = parsed.data
  if (!(await assignFeedItem(user.id, itemId, spaceId))) {
    return { ok: false, error: 'Conexão ou espaço inválido.' }
  }
  return refreshed()
}

export type ConnectionsData = { connections: FeedItem[]; spaces: Space[] }

/** "Configurações → Conexões" (loaded when the settings modal opens): the user's connections and spaces. */
export async function loadConnectionsAction(): Promise<
  { ok: true; data: ConnectionsData } | { ok: false; error: string }
> {
  const user = await getServerUser()
  if (!user) return { ok: false, error: SESSION_EXPIRED }
  const [connections, spaces] = await Promise.all([listFeedItems(user.id), listSpaces(user.id)])
  return { ok: true, data: { connections, spaces } }
}
