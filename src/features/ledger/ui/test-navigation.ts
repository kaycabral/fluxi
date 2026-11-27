import { useSyncExternalStore } from 'react'

const listeners = new Set<() => void>()
let patched = false

/** Like Next.js, re-render `useSearchParams` readers when the app calls `history.replaceState`. */
function patchHistory() {
  if (patched) return
  patched = true
  const replaceState = history.replaceState.bind(history)
  history.replaceState = (...args: Parameters<History['replaceState']>) => {
    replaceState(...args)
    for (const listener of listeners) listener()
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** `useSearchParams` for tests: the jsdom URL, live. Use from a `vi.mock('next/navigation')` factory. */
export function useTestSearchParams(): URLSearchParams {
  patchHistory()
  return new URLSearchParams(useSyncExternalStore(subscribe, () => location.search))
}
