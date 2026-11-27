/**
 * The new layout's sidebar, expanded or collapsed, remembered per browser:
 * the client writes this cookie on each toggle and the server reads it so a
 * reload renders the sidebar as the user left it.
 */
export const SIDEBAR_COOKIE = 'fluxi_sidebar'

/** Expanded unless the cookie says collapsed. */
export function sidebarOpenFrom(value: string | undefined): boolean {
  return value !== 'collapsed'
}

/**
 * `<html data-sidebar>`: the state as the loading shell needs it before the
 * first paint (the static shell cannot read cookies). Set from the cookie by
 * `SidebarStateScript` and on each toggle.
 */
export const SIDEBAR_ATTRIBUTE = 'sidebar'

/**
 * Inline script (runs before the shell paints): copies the cookie onto
 * `<html data-sidebar>`. Same rule as `sidebarOpenFrom`.
 */
export const SIDEBAR_STATE_SCRIPT = `try{document.documentElement.dataset.${SIDEBAR_ATTRIBUTE}=/(?:^|; )${SIDEBAR_COOKIE}=collapsed(?:;|$)/.test(document.cookie)?'collapsed':'open'}catch(e){}`
