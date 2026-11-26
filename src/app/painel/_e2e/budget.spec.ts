import { fluxiDb } from '@/db'
import { accounts, banks } from '@/db/schema'
import { monthLabel, monthOf } from '@/features/ledger/core/format'
import { addMonths } from '@/features/ledger/core/month'
import { expect, test } from '@e2e/fixtures'
import { eq } from 'drizzle-orm'

const THIS_MONTH = monthOf(new Date())

test.describe('dashboard and budget', () => {
  test.use({ authAsUser: true })

  test.beforeEach(async ({ user }) => {
    const db = fluxiDb.db()
    const [bank] = await db
      .insert(banks)
      .values({ ...user.scope, name: 'Banco E2E' })
      .returning()
    if (bank === undefined) throw new Error('bank not created')
    await db.insert(accounts).values({
      ...user.scope,
      bankId: bank.id,
      name: 'Conta E2E',
      type: 'checking',
      openingBalanceCents: 500000,
    })
  })

  // The E2E user lives for the whole worker: leave no accounts behind for the
  // specs that run after this one (their balances would be off).
  test.afterEach(async ({ user }) => {
    const db = fluxiDb.db()
    await db.delete(accounts).where(eq(accounts.userId, user.id))
    await db.delete(banks).where(eq(banks.userId, user.id))
  })

  test('the dashboard sums up the money and links to the budget', async ({ page }) => {
    await page.goto('/painel')
    await expect(page.getByRole('heading', { level: 1, name: 'Painel' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Resumo' })).toContainText('R$ 5.000,00')
    await expect(page.getByRole('heading', { name: 'Próximas contas' })).toBeVisible()
    await page
      .getByRole('link', { name: /Orçamento/ })
      .first()
      .click()
    await expect(page).toHaveURL(/\/painel\/orcamento$/)
  })

  test('creates a pot, a new budget version and walks the traffic light', async ({ page }) => {
    await page.goto('/painel/orcamento')
    await expect(page.getByRole('heading', { level: 1, name: 'Orçamento' })).toBeVisible()

    // The first click may land before hydration: retry until the field opens.
    const name = page.getByLabel('Nome do novo pote')
    await expect(async () => {
      await page.getByRole('button', { name: 'Novo pote' }).click()
      await expect(name).toBeVisible({ timeout: 1000 })
    }).toPass()
    await name.fill('Viagens E2E')
    await page.getByLabel('Nome do novo pote').press('Enter')
    await expect(page.getByRole('slider', { name: 'Viagens E2E' })).toBeVisible()

    const next = addMonths(THIS_MONTH, 1)
    await page.getByRole('button', { name: 'Versões do orçamento' }).click()
    await page.getByRole('menuitem', { name: /Nova versão/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Criar versão' }).click()
    await expect(page.getByRole('combobox', { name: 'Versão do orçamento' })).toContainText(
      `${monthLabel(next)} em diante`,
    )

    const range = page.locator('p[aria-live]', { hasText: ' – ' })
    const before = await range.textContent()
    await page.getByRole('button', { name: 'Mês anterior' }).click()
    await expect(range).not.toHaveText(before ?? '')
    await page.getByRole('button', { name: 'Hoje' }).click()
    await expect(range).toHaveText(before ?? '')
  })

  test('old calendar links on /painel still open the calendar', async ({ page }) => {
    await page.goto(`/painel?modo=mes&data=${THIS_MONTH}-01`)
    await expect(page).toHaveURL(/\/painel\/calendario\?modo=mes/)
  })
})
