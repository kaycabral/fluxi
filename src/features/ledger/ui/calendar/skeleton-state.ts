import {
  CALENDAR_PREFS_COOKIE,
  DEFAULT_CALENDAR_PREFS,
} from '@/features/ledger/core/calendar-prefs'
import {
  monthWeeks,
  VIEW_SLUGS,
  type CalendarViewMode,
} from '@/features/ledger/core/calendar-views'

/*
 * The calendar's loading skeleton draws every view and CSS keeps the one on
 * `<html data-cal-view>` (with `data-cal-weekends` and, for the month grid,
 * `data-cal-weeks`): the static shell knows neither the URL nor the prefs
 * cookie, so an inline script sets them before the first paint, and the
 * calendar keeps them current as the user moves (for the next skeleton).
 */

/** The scroll that centers `section` in `root` (the year view and its skeleton). */
export function centeredScrollTop(root: HTMLElement, section: HTMLElement): number {
  return Math.max(0, section.offsetTop - (root.clientHeight - section.offsetHeight) / 2)
}

/** Puts the calendar's shape on `<html>` (the calendar calls it as it renders). */
export function applyCalendarSkeletonState(
  view: CalendarViewMode,
  weekends: boolean,
  date: string,
): void {
  const root = document.documentElement.dataset
  // Hyphenated: an underscore would read as a space in Tailwind's arbitrary selectors.
  root.calView = view.replace('_', '-')
  root.calWeekends = weekends ? 'on' : 'off'
  root.calWeeks = String(monthWeeks(date.slice(0, 7)).length)
  root.calMonth = String(Number(date.slice(5, 7)))
}

/**
 * Inline script (before the first paint): the view from `?modo=`, else the
 * prefs cookie, else the default; weekends from the cookie; the weeks of the
 * month of `?data=`/`?mes=`, else of today. Same rules as the calendar page.
 */
export const CALENDAR_SKELETON_SCRIPT = `try{var q=new URLSearchParams(location.search),slugs=${JSON.stringify(
  Object.fromEntries(Object.entries(VIEW_SLUGS).map(([view, slug]) => [slug, view])),
)},p=${JSON.stringify({ view: DEFAULT_CALENDAR_PREFS.view, weekends: DEFAULT_CALENDAR_PREFS.weekends })};try{var m=document.cookie.match(/(?:^|; )${CALENDAR_PREFS_COOKIE}=([^;]*)/);if(m){var c=JSON.parse(decodeURIComponent(m[1]));if(c&&typeof c.view==='string')p.view=c.view;if(c&&typeof c.weekends==='boolean')p.weekends=c.weekends}}catch(e){}var v=slugs[q.get('modo')||'']||p.view,d=q.get('data')||'',mo=q.get('mes')||'';var y,mm;if(/^\\d{4}-\\d{2}-\\d{2}$/.test(d)){y=+d.slice(0,4);mm=+d.slice(5,7)}else if(/^\\d{4}-\\d{2}$/.test(mo)){y=+mo.slice(0,4);mm=+mo.slice(5,7)}else{var t=new Date();y=t.getFullYear();mm=t.getMonth()+1}var f=new Date(Date.UTC(y,mm-1,1)).getUTCDay(),n=new Date(Date.UTC(y,mm,0)).getUTCDate(),r=document.documentElement.dataset;r.calView=String(v).replace('_','-');r.calWeekends=p.weekends?'on':'off';r.calWeeks=String(Math.ceil((f+n)/7));r.calMonth=String(mm)}catch(e){}`
