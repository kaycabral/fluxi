import { expect, type Locator } from '@playwright/test'

/**
 * Wait until React has hydrated `locator`'s element. Pages stream in before
 * they hydrate, so the server HTML is visible while client handlers (like the
 * N shortcut) are not listening yet; acting then also makes React report a
 * hydration mismatch. React tags every hydrated DOM node with a `__reactFiber`
 * key, which this waits for.
 */
export async function expectHydrated(locator: Locator): Promise<void> {
  await expect
    .poll(() =>
      locator.evaluate((element) =>
        Object.keys(element).some((key) => key.startsWith('__reactFiber')),
      ),
    )
    .toBe(true)
}
