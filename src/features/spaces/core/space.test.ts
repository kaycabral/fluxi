import { describe, expect, it } from 'vitest'
import {
  assignFeedItemSchema,
  createSpaceSchema,
  pickActiveSpace,
  switcherSpaces,
  type Space,
} from './space'

const PERSONAL: Space = { id: 'p', name: 'Pessoal', kind: 'personal', archived: false }
const SHOP: Space = { id: 's', name: 'Loja', kind: 'business', archived: false }
const AGENCY: Space = { id: 'a', name: 'Agência', kind: 'business', archived: false }
const OLD: Space = { id: 'o', name: 'Antiga', kind: 'business', archived: true }
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
  it('only creates business spaces with a name', () => {
    expect(createSpaceSchema.safeParse({ name: ' Loja ', kind: 'business' }).data).toEqual({
      name: 'Loja',
      kind: 'business',
    })
    expect(createSpaceSchema.safeParse({ name: 'Outra', kind: 'personal' }).success).toBe(false)
    expect(createSpaceSchema.safeParse({ name: ' ', kind: 'business' }).success).toBe(false)
  })

  it('assigns a connection to a space id or to none', () => {
    expect(assignFeedItemSchema.safeParse({ itemId: 'i', spaceId: null }).success).toBe(true)
    expect(assignFeedItemSchema.safeParse({ itemId: 'i', spaceId: 'nope' }).success).toBe(false)
  })
})
