import { z } from 'zod'

/**
 * Espaços: fully separated ledgers of one user ("Pessoal", "Empresa"). Every
 * read and write of financial data is scoped by a {@link Scope}: the session
 * user and the active space, both resolved on the server.
 */

export type SpaceKind = 'personal' | 'business'

export type Space = {
  id: string
  name: string
  kind: SpaceKind
  archived: boolean
}

/** Who and where: every adapter read/write filters by both. */
export type Scope = { userId: string; spaceId: string }

/** Cookie holding the active space id (a hint: the server always re-resolves it). */
export const SPACE_COOKIE = 'fluxi_space'

export const SPACE_KIND_LABELS: Record<SpaceKind, string> = {
  personal: 'Pessoal',
  business: 'Empresa',
}

/**
 * The space a request works in: the one named by the cookie when it is one of
 * the user's active spaces, else the personal one. Never trusts the cookie id
 * by itself: `spaces` are the session user's own.
 */
export function pickActiveSpace(
  spaces: readonly Space[],
  requested: string | undefined,
): Space | null {
  const active = spaces.filter((s) => !s.archived)
  return active.find((s) => s.id === requested) ?? active.find((s) => s.kind === 'personal') ?? null
}

/** Spaces offered by the switcher: active ones, personal first, then by name. */
export function switcherSpaces(spaces: readonly Space[]): Space[] {
  return spaces
    .filter((s) => !s.archived)
    .sort(
      (a, b) =>
        Number(b.kind === 'personal') - Number(a.kind === 'personal') ||
        a.name.localeCompare(b.name, 'pt-BR'),
    )
}

export const spaceIdSchema = z.uuid('Espaço inválido.')

export const createSpaceSchema = z.object({
  name: z.string().trim().min(1, 'Dê um nome ao espaço.').max(40, 'Nome muito longo.'),
  // Every user has exactly one personal space (created with the account).
  kind: z.literal('business', 'Só existe um espaço pessoal.'),
})

export type CreateSpaceInput = z.infer<typeof createSpaceSchema>

export const assignFeedItemSchema = z.object({
  itemId: z.string().trim().min(1).max(100),
  spaceId: spaceIdSchema.nullable(),
})
