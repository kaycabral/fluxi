import { fluxiDb } from '@/db'
import { accounts, banks, userSettings } from '@/db/schema'
import { monthLabel, monthOf } from '@/features/ledger/core/format'
import { addMonths, diffMonths, monthToDate } from '@/features/ledger/core/month'
import { expect, test } from '@e2e/fixtures'
import type { Page } from '@playwright/test'
import { eq } from 'drizzle-orm'

const THIS_MONTH = monthOf(new Date())
const NEXT_MONTH = addMonths(THIS_MONTH, 1)
const LATER_MONTH = addMonths(THIS_MONTH, 2)
// The timeline starts 3 months before the count start (= this month).
const FIRST_COLUMN = addMonths(THIS_MONTH, -3)

/** The compact "Saídas" cell of `month` in the timeline table. */
function expensesCell(page: Page, month: string) {
  const row = page.locator('tr', { has: page.locator('td', { hasText: /^Saídas$/ }) })
  return row.locator('td').nth(1 + diffMonths(FIRST_COLUMN, month))
}

test.describe('ledger critical flow', () => {
  test.use({ authAsUser: true })

  test.beforeEach(async ({ user }) => {
    const db = fluxiDb.db()
    const [bank] = await db.insert(banks).values({ userId: user.id, name: 'Banco E2E' }).returning()
    if (bank === undefined) throw new Error('bank not created')
    await db.insert(accounts).values({
      userId: user.id,
      bankId: bank.id,
      name: 'Conta E2E',
      type: 'checking',
      openingBalanceCents: 500000,
    })
    await db
      .update(userSettings)
      .set({ countFromMonth: monthToDate(THIS_MONTH) })
      .where(eq(userSettings.userId, user.id))
  })

  test('create a monthly expense, then split it from next month on', async ({ page }) => {
    await page.goto('/painel')
    await expect(page.getByRole('heading', { level: 1, name: 'Linha do tempo' })).toBeVisible()

    // Create a monthly expense through the floating button.
    await page.getByRole('button', { name: 'Novo lançamento' }).click()
    const sheet = page.getByRole('dialog', { name: 'Novo lançamento' })
    await expect(sheet).toBeVisible()
    await sheet.getByLabel('Valor (R$)').fill('100')
    await sheet.getByLabel('Descrição').fill('Aluguel E2E')
    await sheet.getByLabel('Data').fill(`${THIS_MONTH}-10`)
    await sheet.getByLabel('Repete').click()
    await page.getByRole('option', { name: 'Todo mês' }).click()
    await sheet.getByRole('button', { name: 'Salvar', exact: true }).click()
    await expect(sheet).toBeHidden()

    // It shows in the timeline totals and in this month's day by day.
    await expect(expensesCell(page, THIS_MONTH)).toHaveText('-100')
    await expect(expensesCell(page, LATER_MONTH)).toHaveText('-100')
    await expect(
      page.getByRole('heading', { name: `${monthLabel(THIS_MONTH)} dia a dia` }),
    ).toBeVisible()
    const thisMonthRow = page.getByRole('row', { name: /Aluguel E2E/ })
    await expect(thisMonthRow).toContainText('-R$ 100')

    // Edit next month's occurrence with "Este e os próximos".
    await page.getByRole('button', { name: monthLabel(NEXT_MONTH), exact: true }).click()
    await expect(
      page.getByRole('heading', { name: `${monthLabel(NEXT_MONTH)} dia a dia` }),
    ).toBeVisible()
    await page.getByRole('row', { name: /Aluguel E2E/ }).click()
    const edit = page.getByRole('dialog', { name: 'Editar lançamento' })
    await expect(edit).toBeVisible()
    await expect(edit.getByLabel('Valor (R$)')).toHaveValue('100,00')
    await edit.getByLabel('Valor (R$)').fill('150')
    await edit.getByRole('button', { name: 'Salvar', exact: true }).click()

    const scope = page.getByRole('dialog', { name: 'Aplicar a mudança em…' })
    await expect(scope).toContainText('Aluguel E2E')
    await scope.getByLabel(/Este e os próximos/).check()
    await scope.getByRole('button', { name: 'Aplicar' }).click()
    await expect(edit).toBeHidden()

    // The split: this month keeps 100, next month on is 150.
    await expect(expensesCell(page, THIS_MONTH)).toHaveText('-100')
    await expect(expensesCell(page, NEXT_MONTH)).toHaveText('-150')
    await expect(expensesCell(page, LATER_MONTH)).toHaveText('-150')
    await expect(page.getByRole('row', { name: /Aluguel E2E/ })).toContainText('-R$ 150')
  })
})
