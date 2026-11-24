/**
 * Whether the MVP screens (the `(legacy)` route group) are reachable. Production
 * only has the new layout; local and preview deploys keep them while each one
 * moves over.
 */
export function legacyScreensEnabled(): boolean {
  return process.env.VERCEL_ENV !== 'production'
}
