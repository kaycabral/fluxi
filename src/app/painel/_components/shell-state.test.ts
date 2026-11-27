import {
  applyCalendarSkeletonState,
  CALENDAR_SKELETON_SCRIPT,
} from '@/features/ledger/ui/calendar/skeleton-state'
import { SHAPE_HINT_KEY, SHAPE_HINT_SCRIPT } from '@/features/ledger/ui/skeleton-shape-hint'
import { afterEach, describe, expect, it } from 'vitest'
import { SIDEBAR_STATE_SCRIPT } from './sidebar-state'

/** Runs an inline script as the browser does: a <script> element in the document. */
function run(script: string) {
  const tag = document.createElement('script')
  tag.textContent = script
  document.head.append(tag)
  tag.remove()
}

const root = () => document.documentElement.dataset

afterEach(() => {
  for (const key of Object.keys(root())) delete root()[key]
  document.cookie = 'fluxi_sidebar=; Max-Age=0'
  document.cookie = 'fluxi_calendar=; Max-Age=0'
  window.localStorage.clear()
  window.history.replaceState(null, '', '/')
})

describe('shell state scripts', () => {
  it('copies the sidebar cookie onto <html data-sidebar>', () => {
    run(SIDEBAR_STATE_SCRIPT)
    expect(root().sidebar).toBe('open')
    document.cookie = 'fluxi_sidebar=collapsed'
    run(SIDEBAR_STATE_SCRIPT)
    expect(root().sidebar).toBe('collapsed')
  })

  it('puts the remembered list sizes on <html>, else the defaults', () => {
    run(SHAPE_HINT_SCRIPT)
    expect(root().skelGroups).toBe('g1 g2 g3 g4 g5 g6')
    expect(root().skelGroupsLast).toBe('g6')
    window.localStorage.setItem(SHAPE_HINT_KEY, JSON.stringify({ groups: 7, pots: 2 }))
    run(SHAPE_HINT_SCRIPT)
    expect(root().skelGroups).toBe('g1 g2 g3 g4 g5 g6 g7')
    expect(root().skelGroupsLast).toBe('g7')
    expect(root().skelPots).toBe('g1 g2')
  })

  it('reads the calendar view from ?modo=, else the prefs cookie, and the weeks of ?data=', () => {
    document.cookie = `fluxi_calendar=${encodeURIComponent(JSON.stringify({ view: 'year', weekends: false }))}`
    window.history.replaceState(null, '', '/painel/calendario?data=2026-08-10')
    run(CALENDAR_SKELETON_SCRIPT)
    expect(root()).toMatchObject({
      calView: 'year',
      calWeekends: 'off',
      calWeeks: '6',
      calMonth: '8',
    })
    window.history.replaceState(null, '', '/painel/calendario?modo=4dias&data=2026-02-03')
    run(CALENDAR_SKELETON_SCRIPT)
    // February 2026 starts on a Sunday: four weeks.
    expect(root()).toMatchObject({ calView: 'four-days', calWeeks: '4', calMonth: '2' })
  })

  it('the calendar keeps the same state as it moves', () => {
    applyCalendarSkeletonState('four_days', true, '2026-11-27')
    expect(root()).toMatchObject({
      calView: 'four-days',
      calWeekends: 'on',
      calWeeks: '5',
      calMonth: '11',
    })
  })
})
