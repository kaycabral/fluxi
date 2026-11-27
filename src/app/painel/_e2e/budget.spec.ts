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

  test('the bills tabs never hide the active tab on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/painel')
    const list = page.getByRole('tablist')
    // At 390px the tabs overflow: the hidden end fades.
    await expect(list).toHaveAttribute('data-fade-end', 'true')
    const last = list.getByRole('tab', { name: /Próximo mês/ })
    await last.click()
    await expect(last).toHaveAttribute('aria-selected', 'true')
    // Fully inside the strip once the scroll settles.
    await expect
      .poll(async () =>
        list.evaluate((el) => {
          const tab = el.querySelector('[data-state="active"]')
          if (tab === null) return false
          const outer = el.getBoundingClientRect()
          const inner = tab.getBoundingClientRect()
          return inner.left >= outer.left - 1 && inner.right <= outer.right + 1
        }),
      )
      .toBe(true)
    // Aligned to the end: nothing left to the right, the start fades instead.
    await expect(list).toHaveAttribute('data-fade-start', 'true')
    await expect(list).not.toHaveAttribute('data-fade-end')
  })

  test('the dashboard sums up the money and links to the budget', async ({ page }) => {
    await page.goto('/painel')
    await expect(page.getByRole('heading', { level: 1, name: 'Painel' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Resumo' })).toContainText('R$ 5.000,00')
    await expect(page.getByRole('heading', { name: 'Contas', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Orçamento', exact: true })).toBeVisible()
    // The banks behind today's balance, each with its balance on hover.
    const banksOfBalance = page.getByRole('button', { name: 'Saldo por banco: Banco E2E' })
    await expect(async () => {
      await banksOfBalance.hover()
      await expect(page.getByRole('list', { name: 'Saldo por banco' }).first()).toContainText(
        /Banco E2E.*R\$ 5\.000,00/,
        { timeout: 1000 },
      )
    }).toPass()
    await page
      .getByRole('link', { name: /Orçamento/ })
      .first()
      .click()
    await expect(page).toHaveURL(/\/painel\/orcamento$/)
  })

  test('creates a budget group, a new budget version and walks the traffic light', async ({
    page,
  }) => {
    await page.goto('/painel/orcamento')
    await expect(page.getByRole('heading', { level: 1, name: 'Orçamento' })).toBeVisible()

    // The first click may land before hydration: retry until the field opens.
    const name = page.getByLabel('Nome do novo grupo')
    await expect(async () => {
      await page.getByRole('button', { name: 'Novo grupo' }).click()
      await expect(name).toBeVisible({ timeout: 1000 })
    }).toPass()
    await name.fill('Viagens E2E')
    await page.getByLabel('Nome do novo grupo').press('Enter')
    await expect(page.getByRole('slider', { name: 'Viagens E2E' })).toBeVisible()

    const next = addMonths(THIS_MONTH, 1)
    await page.getByRole('button', { name: 'Versões do orçamento' }).click()
    await page.getByRole('menuitem', { name: /Nova versão/ }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Criar versão' }).click()
    await expect(page.getByRole('combobox', { name: 'Versão do orçamento' })).toContainText(
      `${monthLabel(next)} em diante`,
    )

    // Adaptive window: as many months as fit the full-width card (more than the
    // minimum at the E2E viewport), opening on the current month.
    const light = page.getByRole('table')
    const firstMonth = light.getByRole('columnheader').nth(1)
    await expect(async () => {
      expect(await light.getByRole('columnheader').count()).toBeGreaterThan(4)
    }).toPass()
    await expect(firstMonth).toHaveText(monthLabel(THIS_MONTH))
    await page.getByRole('button', { name: 'Mês anterior' }).click()
    await expect(firstMonth).toHaveText(monthLabel(addMonths(THIS_MONTH, -1)))
    await page.getByRole('button', { name: 'Hoje' }).click()
    await expect(firstMonth).toHaveText(monthLabel(THIS_MONTH))
  })

  test('old calendar links on /painel still open the calendar', async ({ page }) => {
    await page.goto(`/painel?modo=mes&data=${THIS_MONTH}-01`)
    await expect(page).toHaveURL(/\/painel\/calendario\?modo=mes/)
  })
})
