import { describe, expect, it } from 'vitest'
import {
  assignFeedItemSchema,
  createSpaceSchema,
  isSpaceIcon,
  pickActiveSpace,
  SPACE_ICON_LABELS,
  SPACE_ICONS,
  switcherSpaces,
  updateSpaceSchema,
  type Space,
} from './space'

const PERSONAL: Space = {
  id: 'p',
  name: 'Pessoal',
  kind: 'personal',
  icon: 'user',
  archived: false,
}
const SHOP: Space = { id: 's', name: 'Loja', kind: 'business', icon: 'store', archived: false }
const AGENCY: Space = { id: 'a', name: 'Agência', kind: 'business', icon: 'store', archived: false }
const OLD: Space = { id: 'o', name: 'Antiga', kind: 'business', icon: 'store', archived: true }
const ALL = [SHOP, OLD, PERSONAL, AGENCY]

describe('pickActiveSpace', () => {
  it('picks the requested space when it is one of the user’s active spaces', () => {
    expect(pickActiveSpace(ALL, 's')).toBe(SHOP)
  })

  it('falls back to the personal space for a missing, archived or foreign id', () => {
    expect(pickActiveSpace(ALL, undefined)).toBe(PERSONAL)
    expect(pickActiveSpace(ALL, 'o')).toBe(PERSONAL)
    expect(pickActiveSpace(ALL, 'someone-else')).toBe(PERSONAL)
  })

  it('returns null when the user has no personal space yet', () => {
    expect(pickActiveSpace([SHOP], 'x')).toBeNull()
  })
})

describe('switcherSpaces', () => {
  it('lists active spaces, personal first, then by name', () => {
    expect(switcherSpaces(ALL).map((s) => s.name)).toEqual(['Pessoal', 'Agência', 'Loja'])
  })
})

describe('schemas', () => {
  it('creates a space with any name and an optional icon, never choosing a kind', () => {
    expect(createSpaceSchema.safeParse({ name: ' Freela ' }).data).toEqual({
      name: 'Freela',
      icon: 'briefcase',
    })
    expect(createSpaceSchema.safeParse({ name: 'Casa', icon: 'house' }).data).toEqual({
      name: 'Casa',
      icon: 'house',
    })
    expect(createSpaceSchema.safeParse({ name: ' ' }).success).toBe(false)
    expect(createSpaceSchema.safeParse({ name: 'Casa', icon: 'rocket' }).success).toBe(false)
  })

  it('edits a space by id, name and a known icon', () => {
    const id = '00000000-0000-4000-8000-000000000001'
    expect(updateSpaceSchema.safeParse({ id, name: ' Casa ', icon: 'house' }).data).toEqual({
      id,
      name: 'Casa',
      icon: 'house',
    })
    expect(updateSpaceSchema.safeParse({ id: 'x', name: 'Casa', icon: 'house' }).success).toBe(
      false,
    )
    expect(updateSpaceSchema.safeParse({ id, name: 'Casa' }).success).toBe(false)
  })

  it('offers ten icons, each with a label', () => {
    expect(SPACE_ICONS).toHaveLength(10)
    expect(SPACE_ICONS.every((icon) => isSpaceIcon(icon) && SPACE_ICON_LABELS[icon])).toBe(true)
    expect(isSpaceIcon('rocket')).toBe(false)
  })

  it('assigns a connection to a space id or to none', () => {
    expect(assignFeedItemSchema.safeParse({ itemId: 'i', spaceId: null }).success).toBe(true)
    expect(assignFeedItemSchema.safeParse({ itemId: 'i', spaceId: 'nope' }).success).toBe(false)
  })
})
