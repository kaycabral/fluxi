import { waitForGoogleSignIn } from '@e2e/auth'
import { expect, test } from '@e2e/fixtures'

test.describe('signed in', () => {
  test.use({ authAsUser: true })

  // Infra smoke: the /api/e2e-signin session cookies load into the browser and
  // the user reaches /painel without being bounced to the login.
  test('reaches /painel with the session from /api/e2e-signin', async ({ page, user }) => {
    await page.goto('/painel')
    await expect(page).toHaveURL(/\/painel$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Fluxi' })).toBeVisible()
    await expect(page.getByText(user.email)).toBeVisible()
  })

  test('/ sends a signed-in user to /painel', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/painel$/)
  })
})

test.describe('signed out', () => {
  // The painel layout redirects to `/?login=1&next=…` and AutoSignIn starts the
  // Google sign-in, carrying the page as `next`.
  test('redirects /painel to the Google sign-in', async ({ page }) => {
    const signIn = waitForGoogleSignIn(page)
    await page.goto('/painel')
    await expect(signIn).resolves.toEqual({ callbackPath: '/auth/callback', next: '/painel' })
  })

  test('the landing button starts the Google sign-in', async ({ page }) => {
    await page.goto('/')
    const signIn = waitForGoogleSignIn(page)
    await page.getByRole('button', { name: 'Entrar com Google' }).click()
    await expect(signIn).resolves.toEqual({ callbackPath: '/auth/callback', next: '/' })
  })
})
