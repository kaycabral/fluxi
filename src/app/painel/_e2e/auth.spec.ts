import { waitForGoogleSignIn } from '@e2e/auth'
import { expect, test } from '@e2e/fixtures'

test.describe('signed in', () => {
  test.use({ authAsUser: true })

  // Infra smoke: the /api/e2e-signin session cookies load into the browser and
  // the user reaches /painel without being bounced to the login.
  test('reaches /painel with the session from /api/e2e-signin', async ({ page }) => {
    await page.goto('/painel')
    await expect(page).toHaveURL(/\/painel$/)
    // The dashboard is the main view, in the new sidebar layout.
    await expect(page.getByRole('heading', { level: 1, name: 'Painel' })).toBeVisible()
    const nav = page.getByRole('navigation', { name: 'Seções' })
    for (const name of ['Painel', 'Calendário', 'Transações', 'Orçamento']) {
      await expect(nav.getByRole('link', { name })).toBeVisible()
    }
  })

  test('the old /painel/lancamentos address lands on Transações', async ({ page }) => {
    const response = await page.request.get('/painel/lancamentos', { maxRedirects: 0 })
    expect(response.status()).toBe(308)
    await page.goto('/painel/lancamentos')
    await expect(page).toHaveURL(/\/painel\/transacoes$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Transações' })).toBeVisible()
  })

  test('the space menu holds the account, the settings and sign-out', async ({ page, user }) => {
    await page.goto('/painel')
    await page
      .getByRole('button', { name: 'Espaço: Pessoal. Trocar de espaço e abrir a conta' })
      .click()
    const menu = page.getByRole('menu')
    await expect(menu).toContainText(user.email)
    await expect(menu.getByRole('menuitem', { name: 'Sair' })).toBeVisible()
    await menu.getByRole('menuitem', { name: 'Configurações' }).click()
    await expect(page).toHaveURL(/\/painel#configuracoes\/conexoes$/)
    const settings = page.getByRole('dialog', { name: 'Conexões' })
    await expect(settings).toBeVisible()
    await expect(settings).toContainText('Nenhuma conexão ainda.')
    await page.keyboard.press('Escape')
    await expect(settings).toBeHidden()
    await expect(page).toHaveURL(/\/painel$/)

    // The settings and the old connections addresses open the painel with the modal.
    for (const address of ['/painel/configuracoes', '/painel/conexoes']) {
      await page.goto(address)
      await expect(page).toHaveURL(/\/painel#configuracoes\/conexoes$/)
      await expect(page.getByRole('dialog', { name: 'Conexões' })).toBeVisible()
    }
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
