import { smokeSuite } from '@cbrl/testing/playwright'
import { expect, test } from '@playwright/test'

// GET /api/health -> 200 { status: 'ok' }, and `/` renders with a title.
smokeSuite()

// The legal pages are public (Google OAuth consent screen links them): no login,
// no redirect.
for (const [path, heading] of [
  ['/privacidade', 'Política de privacidade'],
  ['/termos', 'Termos de uso'],
] as const) {
  test(`${path} is public`, async ({ page }) => {
    const response = await page.goto(path)
    expect(response?.status()).toBe(200)
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
  })
}
