import type { BudgetGroupKey } from '@/features/ledger/core/types'
import { mode, type PlannedEntry } from './grouping'

/** Notion `Type` → budget group (expenses only; anything else → no budget group). */
const GROUP_OF_TYPE: Readonly<Record<string, BudgetGroupKey>> = {
  Essential: 'essential',
  Comfort: 'comfort',
  'Guilt Free': 'guilt_free',
  Educacional: 'education',
  Variable: 'variable',
  Investment: 'investment',
}

export function budgetGroupOfType(type: string | null): BudgetGroupKey | null {
  return type === null ? null : (GROUP_OF_TYPE[type] ?? null)
}

/** Budget group of a planned entry: only expenses carry one. */
export function budgetGroupOfEntry(
  entry: Pick<PlannedEntry, 'kind' | 'type'>,
): BudgetGroupKey | null {
  return entry.kind === 'expense' ? budgetGroupOfType(entry.type) : null
}

export const UNGROUPED = 'Sem grupo'

export type PlannedCategory = {
  /** `group\u0000name`, unique per plan. */
  key: string
  groupName: string
  name: string
  /** The budget group most used with it among expense occurrences (null if none). */
  defaultBudgetGroup: BudgetGroupKey | null
}

export const categoryKey = (groupName: string, name: string) => `${groupName}\u0000${name}`

/** Category key of an entry: transfers and rows without a sub-category have none. */
export function categoryKeyOf(entry: PlannedEntry): string | null {
  if (entry.kind === 'transfer' || entry.subCategory === null) return null
  return categoryKey(entry.group ?? UNGROUPED, entry.subCategory)
}

/** Every category the entries use, in first-use order, with its default budget group. */
export function planCategories(entries: readonly PlannedEntry[]): PlannedCategory[] {
  const budgetGroups = new Map<
    string,
    { groupName: string; name: string; budgetGroups: BudgetGroupKey[] }
  >()
  for (const entry of entries) {
    const key = categoryKeyOf(entry)
    if (key === null || entry.subCategory === null) continue
    const slot = budgetGroups.get(key) ?? {
      groupName: entry.group ?? UNGROUPED,
      name: entry.subCategory,
      budgetGroups: [],
    }
    budgetGroups.set(key, slot)
    const budgetGroup = budgetGroupOfEntry(entry)
    if (budgetGroup !== null) slot.budgetGroups.push(...entry.occurrences.map(() => budgetGroup))
  }
  return [...budgetGroups.entries()].map(([key, slot]) => ({
    key,
    groupName: slot.groupName,
    name: slot.name,
    defaultBudgetGroup: mode(slot.budgetGroups) ?? null,
  }))
}
