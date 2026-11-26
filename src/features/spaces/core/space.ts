import { z } from 'zod'

/**
 * Espaços: fully separated ledgers of one user ("Pessoal", "Loja", "Casa"…). Every
 * read and write of financial data is scoped by a {@link Scope}: the session
 * user and the active space, both resolved on the server.
 */

/**
 * `personal` = the user's default space (created with the account, never
 * archived); `business` = any other space. Only an invariant, never shown:
 * users name spaces freely, so the app cannot know what a space is for.
 */
export type SpaceKind = 'personal' | 'business'

/**
 * Icons a space can wear (lucide names; the `spaces_icon_valid` check lists the
 * same keys): the usual workspace pictures of finance apps — the person, home,
 * job, shop, company, freelance, family, studies, trip and savings.
 */
export const SPACE_ICONS = [
  'user',
  'house',
  'briefcase',
  'store',
  'building-2',
  'laptop',
  'heart',
  'graduation-cap',
  'plane',
  'piggy-bank',
] as const

export type SpaceIconKey = (typeof SPACE_ICONS)[number]

export const SPACE_ICON_LABELS: Record<SpaceIconKey, string> = {
  user: 'Pessoa',
  house: 'Casa',
  briefcase: 'Trabalho',
  store: 'Loja',
  'building-2': 'Empresa',
  laptop: 'Freela',
  heart: 'Família',
  'graduation-cap': 'Estudos',
  plane: 'Viagem',
  'piggy-bank': 'Reserva',
}

/** Icon of a space a user creates when they pick none. */
export const DEFAULT_SPACE_ICON: SpaceIconKey = 'briefcase'

export function isSpaceIcon(value: string): value is SpaceIconKey {
  return SPACE_ICONS.some((icon) => icon === value)
}

export type Space = {
  id: string
  name: string
  kind: SpaceKind
  icon: SpaceIconKey
  archived: boolean
}

/** Who and where: every adapter read/write filters by both. */
export type Scope = { userId: string; spaceId: string }

/** Cookie holding the active space id (a hint: the server always re-resolves it). */
export const SPACE_COOKIE = 'fluxi_space'

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

const spaceNameSchema = z
  .string()
  .trim()
  .min(1, 'Dê um nome ao espaço.')
  .max(40, 'Nome muito longo.')
const spaceIconSchema = z.enum(SPACE_ICONS, 'Ícone inválido.')

/** "Novo espaço…": any name; the kind is never chosen (every user has exactly one personal space). */
export const createSpaceSchema = z.object({
  name: spaceNameSchema,
  icon: spaceIconSchema.default(DEFAULT_SPACE_ICON),
})

export type CreateSpaceInput = z.infer<typeof createSpaceSchema>

/** "Editar espaço…": rename and change the icon of one of the user's spaces (personal included). */
export const updateSpaceSchema = z.object({
  id: spaceIdSchema,
  name: spaceNameSchema,
  icon: spaceIconSchema,
})

export type UpdateSpaceInput = z.infer<typeof updateSpaceSchema>

export const assignFeedItemSchema = z.object({
  itemId: z.string().trim().min(1).max(100),
  spaceId: spaceIdSchema.nullable(),
})
