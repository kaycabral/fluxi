/**
 * The app's runtime role (migration `0034_app_role`): no owner, no RLS bypass,
 * DML on the app tables only. Production connects as it with a password set by
 * the operator (docs/production.md); the LOCAL stack gives it a fixed password
 * here, like the stack's own `postgres:postgres`, so local dev, E2E and the
 * integration suite run the app exactly as production does.
 */
export const APP_ROLE = 'fluxi_app'

const LOCAL_APP_PASSWORD = 'fluxi_app'
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', 'postgres'])

/** SQL that lets the role log in on the LOCAL stack (run as the owner). */
export const LOCAL_APP_LOGIN = `alter role ${APP_ROLE} login password '${LOCAL_APP_PASSWORD}'`

/** `ownerUrl` (a local stack URL) with the runtime role's local credentials. */
export function localAppUrl(ownerUrl: string): string {
  const url = new URL(ownerUrl)
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`refusing a non-local Postgres for the local app role (host: ${url.hostname})`)
  }
  url.username = APP_ROLE
  url.password = LOCAL_APP_PASSWORD
  return url.toString()
}
