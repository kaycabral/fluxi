const ONE_YEAR = 60 * 60 * 24 * 365

/**
 * Remember a small preference in this browser: a first-party cookie the server
 * reads back to render the page as the user left it. `Secure` on https.
 */
export function writeBrowserCookie(
  name: string,
  value: string,
  { path, secure = window.location.protocol === 'https:' }: { path: string; secure?: boolean },
): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${ONE_YEAR}; SameSite=Lax${secure ? '; Secure' : ''}`
}

/** Read a cookie of this browser (`undefined` when missing). */
export function readBrowserCookie(name: string): string | undefined {
  const prefix = `${name}=`
  const raw = document.cookie
    .split('; ')
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length)
  if (raw === undefined) return undefined
  try {
    return decodeURIComponent(raw)
  } catch {
    return undefined
  }
}
