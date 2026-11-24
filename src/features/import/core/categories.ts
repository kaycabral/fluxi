import type { PotKey } from '@/features/ledger/core/types'
import { mode, type PlannedEntry } from './grouping'

/** Notion `Type` → budget pot (expenses only; anything else → no pot). */
const POT_OF_TYPE: Readonly<Record<string, PotKey>> = {
  Essential: 'essential',
  Comfort: 'comfort',
  'Guilt Free': 'guilt_free',
  Educacional: 'education',
  Variable: 'variable',
  Investment: 'investment',
}

export function potOfType(type: string | null): PotKey | null {
  return type === null ? null : (POT_OF_TYPE[type] ?? null)
}

/** Pot of a planned entry: only expenses carry one. */
export function potOfEntry(entry: Pick<PlannedEntry, 'kind' | 'type'>): PotKey | null {
  return entry.kind === 'expense' ? potOfType(entry.type) : null
}

export const UNGROUPED = 'Sem grupo'

export type PlannedCategory = {
  /** `group\u0000name`, unique per plan. */
  key: string
  groupName: string
  name: string
  /** The pot most used with it among expense occurrences (null if none). */
  defaultPot: PotKey | null
}

export const categoryKey = (groupName: string, name: string) => `${groupName}\u0000${name}`

/** Category key of an entry: transfers and rows without a sub-category have none. */
export function categoryKeyOf(entry: PlannedEntry): string | null {
  if (entry.kind === 'transfer' || entry.subCategory === null) return null
  return categoryKey(entry.group ?? UNGROUPED, entry.subCategory)
}

/** Every category the entries use, in first-use order, with its default pot. */
export function planCategories(entries: readonly PlannedEntry[]): PlannedCategory[] {
  const pots = new Map<string, { groupName: string; name: string; pots: PotKey[] }>()
  for (const entry of entries) {
    const key = categoryKeyOf(entry)
    if (key === null || entry.subCategory === null) continue
    const slot = pots.get(key) ?? {
      groupName: entry.group ?? UNGROUPED,
      name: entry.subCategory,
      pots: [],
    }
    pots.set(key, slot)
    const pot = potOfEntry(entry)
    if (pot !== null) slot.pots.push(...entry.occurrences.map(() => pot))
  }
  return [...pots.entries()].map(([key, slot]) => ({
    key,
    groupName: slot.groupName,
    name: slot.name,
    defaultPot: mode(slot.pots) ?? null,
  }))
}
