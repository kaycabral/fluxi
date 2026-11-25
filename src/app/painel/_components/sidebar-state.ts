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
