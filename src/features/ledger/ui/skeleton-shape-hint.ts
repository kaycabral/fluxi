import { DEFAULT_BUDGET_GROUPS } from '@/features/ledger/core/defaults'

/*
 * The static shell is the same for everyone, so before the session arrives
 * its skeletons do not know how many budget groups the space has. This
 * browser remembers the counts (never names: only how many rows to draw) and
 * an inline script puts them on `<html>` before the first paint; rows beyond
 * the count hide by CSS. Once the painel shell has the refs, the skeletons
 * draw the real groups and update the hint.
 */

/** Browser storage key of the hint (`{ groups, pots }`). */
export const SHAPE_HINT_KEY = 'fluxi:skeleton-shape'

/** Most rows a skeleton draws while it only has the hint. */
export const SHAPE_HINT_MAX = 12

export type ShapeHint = { groups: number; pots: number }

export const DEFAULT_SHAPE_HINT: ShapeHint = {
  groups: DEFAULT_BUDGET_GROUPS.length,
  pots: DEFAULT_BUDGET_GROUPS.filter((g) => g.goal === 'minimum').length,
}

/** `n` → `"g1 g2 … gn"`: the tokens the row classes match (`~=`). */
function tokens(n: number): string {
  return Array.from(
    { length: Math.min(SHAPE_HINT_MAX, Math.max(0, n)) },
    (_, i) => `g${i + 1}`,
  ).join(' ')
}

/** Puts the hint on `<html data-skel-groups data-skel-pots>`. */
export function applyShapeHint(hint: ShapeHint): void {
  document.documentElement.dataset.skelGroups = tokens(hint.groups)
  document.documentElement.dataset.skelGroupsLast = `g${hint.groups}`
  document.documentElement.dataset.skelPots = tokens(hint.pots)
}

/** Remembers the space's counts for the next cold load (best effort). */
export function rememberShapeHint(hint: ShapeHint): void {
  applyShapeHint(hint)
  try {
    window.localStorage.setItem(SHAPE_HINT_KEY, JSON.stringify(hint))
  } catch {
    // Storage blocked: the shell falls back to the default counts.
  }
}

/** Inline script (before the first paint): the stored hint, else the defaults, onto `<html>`. */
export const SHAPE_HINT_SCRIPT = `try{var d=${JSON.stringify(DEFAULT_SHAPE_HINT)},h=d;try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(SHAPE_HINT_KEY)})||'null');if(s&&s.groups>=0&&s.pots>=0)h=s}catch(e){}var t=function(n){var a=[];for(var i=1;i<=Math.min(${SHAPE_HINT_MAX},n);i++)a.push('g'+i);return a.join(' ')},r=document.documentElement;r.dataset.skelGroups=t(h.groups);r.dataset.skelGroupsLast='g'+h.groups;r.dataset.skelPots=t(h.pots)}catch(e){}`

/**
 * Row `i` (0-based) of a hinted list: hidden unless the hint has `g{i+1}`.
 * Literal classes for Tailwind, one per row.
 */
export const GROUP_ROW_CLASSES: readonly string[] = [
  '[html:not([data-skel-groups~=g1])_&]:hidden',
  '[html:not([data-skel-groups~=g2])_&]:hidden',
  '[html:not([data-skel-groups~=g3])_&]:hidden',
  '[html:not([data-skel-groups~=g4])_&]:hidden',
  '[html:not([data-skel-groups~=g5])_&]:hidden',
  '[html:not([data-skel-groups~=g6])_&]:hidden',
  '[html:not([data-skel-groups~=g7])_&]:hidden',
  '[html:not([data-skel-groups~=g8])_&]:hidden',
  '[html:not([data-skel-groups~=g9])_&]:hidden',
  '[html:not([data-skel-groups~=g10])_&]:hidden',
  '[html:not([data-skel-groups~=g11])_&]:hidden',
  '[html:not([data-skel-groups~=g12])_&]:hidden',
]

/** Row `i` when it is the hinted last one: no bottom border (the real last row has none). */
export const GROUP_LAST_ROW_CLASSES: readonly string[] = [
  '[html[data-skel-groups-last=g1]_&]:border-0',
  '[html[data-skel-groups-last=g2]_&]:border-0',
  '[html[data-skel-groups-last=g3]_&]:border-0',
  '[html[data-skel-groups-last=g4]_&]:border-0',
  '[html[data-skel-groups-last=g5]_&]:border-0',
  '[html[data-skel-groups-last=g6]_&]:border-0',
  '[html[data-skel-groups-last=g7]_&]:border-0',
  '[html[data-skel-groups-last=g8]_&]:border-0',
  '[html[data-skel-groups-last=g9]_&]:border-0',
  '[html[data-skel-groups-last=g10]_&]:border-0',
  '[html[data-skel-groups-last=g11]_&]:border-0',
  '[html[data-skel-groups-last=g12]_&]:border-0',
]

export const POT_ROW_CLASSES: readonly string[] = [
  '[html:not([data-skel-pots~=g1])_&]:hidden',
  '[html:not([data-skel-pots~=g2])_&]:hidden',
  '[html:not([data-skel-pots~=g3])_&]:hidden',
  '[html:not([data-skel-pots~=g4])_&]:hidden',
  '[html:not([data-skel-pots~=g5])_&]:hidden',
  '[html:not([data-skel-pots~=g6])_&]:hidden',
  '[html:not([data-skel-pots~=g7])_&]:hidden',
  '[html:not([data-skel-pots~=g8])_&]:hidden',
  '[html:not([data-skel-pots~=g9])_&]:hidden',
  '[html:not([data-skel-pots~=g10])_&]:hidden',
  '[html:not([data-skel-pots~=g11])_&]:hidden',
  '[html:not([data-skel-pots~=g12])_&]:hidden',
]
