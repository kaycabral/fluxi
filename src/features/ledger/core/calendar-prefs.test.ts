import { describe, expect, it } from 'vitest'
import { DEFAULT_CALENDAR_PREFS, parseCalendarPrefs } from './calendar-prefs'

describe('parseCalendarPrefs', () => {
  it('reads the cookie, filling what is missing with the defaults', () => {
    expect(parseCalendarPrefs(JSON.stringify({ view: 'week', skipped: true }))).toEqual({
      ...DEFAULT_CALENDAR_PREFS,
      view: 'week',
      skipped: true,
    })
  })

  it('falls back to the defaults for a missing, malformed or invalid cookie', () => {
    expect(parseCalendarPrefs(undefined)).toEqual(DEFAULT_CALENDAR_PREFS)
    expect(parseCalendarPrefs('{nada')).toEqual(DEFAULT_CALENDAR_PREFS)
    expect(parseCalendarPrefs(JSON.stringify({ view: 'decade' }))).toEqual(DEFAULT_CALENDAR_PREFS)
  })
})
