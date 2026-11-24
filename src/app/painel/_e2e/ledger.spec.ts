import { fluxiDb } from '@/db'
import { accounts, banks, entries, userSettings } from '@/db/schema'
import {
  formatAmount,
  isoDayOf,
  monthLabel,
  monthOf,
  parseMoneyInput,
} from '@/features/ledger/core/format'
import { addMonths, diffMonths, monthToDate } from '@/features/ledger/core/month'
import { expect, test } from '@e2e/fixtures'
import type { Page } from '@playwright/test'
import { eq } from 'drizzle-orm'

const THIS_MONTH = monthOf(new Date())
const TODAY_DAY = Number(isoDayOf(new Date()).slice(8, 10))
const NEXT_MONTH = addMonths(THIS_MONTH, 1)
const LATER_MONTH = addMonths(THIS_MONTH, 2)
// The timeline starts 3 months before the count start (= this month).
const FIRST_COLUMN = addMonths(THIS_MONTH, -3)

/** The compact cell of `month` in the timeline row whose first cell is `label`. */
function timelineCell(page: Page, label: RegExp, month: string) {
  const row = page.locator('tr', { has: page.locator('td:first-child', { hasText: label }) })
  return row.locator('td').nth(1 + diffMonths(FIRST_COLUMN, month))
}

/** The compact "Saídas" cell of `month` in the timeline table. */
function expensesCell(page: Page, month: string) {
  const row = page.locator('tr', { has: page.locator('td', { hasText: /^Saídas$/ }) })
  return row.locator('td').nth(1 + diffMonths(FIRST_COLUMN, month))
}

/** A benefit account (R$ 300 opening) at its own bank with a monthly R$ 800 credit. */
async function seedBenefit(userId: string) {
  const db = fluxiDb.db()
  const [bank] = await db.insert(banks).values({ userId, name: 'Vale E2E' }).returning()
  if (bank === undefined) throw new Error('bank not created')
  const [benefit] = await db
    .insert(accounts)
    .values({
      userId,
      bankId: bank.id,
      name: 'VA E2E',
      type: 'benefit',
      openingBalanceCents: 30000,
    })
    .returning()
  if (benefit === undefined) throw new Error('account not created')
  await db.insert(entries).values({
    userId,
    kind: 'income',
    description: 'Crédito VA E2E',
    amountCents: 80000,
    accountId: benefit.id,
    startMonth: monthToDate(THIS_MONTH),
    day: 1,
    recurrence: 'monthly',
  })
}

test.describe('ledger critical flow', () => {
  test.use({ authAsUser: true })

  let accountId = ''

  test.beforeEach(async ({ user }) => {
    const db = fluxiDb.db()
    const [bank] = await db.insert(banks).values({ userId: user.id, name: 'Banco E2E' }).returning()
    if (bank === undefined) throw new Error('bank not created')
    const [account] = await db
      .insert(accounts)
      .values({
        userId: user.id,
        bankId: bank.id,
        name: 'Conta E2E',
        type: 'checking',
        openingBalanceCents: 500000,
      })
      .returning()
    if (account === undefined) throw new Error('account not created')
    accountId = account.id
    await db
      .update(userSettings)
      .set({ countFromMonth: monthToDate(THIS_MONTH) })
      .where(eq(userSettings.userId, user.id))
  })

  test('benefits stay out of the available balance and show in their own block', async ({
    page,
    user,
  }) => {
    await seedBenefit(user.id)

    await page.goto('/painel/linha-do-tempo')
    await expect(page.getByRole('heading', { level: 1, name: 'Linha do tempo' })).toBeVisible()
    // Saldo total and Entradas are the available money only (the checking account's R$ 5.000).
    await expect(timelineCell(page, /^Saldo total$/, THIS_MONTH)).toHaveText('5.000,00')
    await expect(timelineCell(page, /^Entradas$/, THIS_MONTH)).toHaveText('0,00')
    // R$ 300 + R$ 800 in the benefit block.
    await expect(timelineCell(page, /^Benefícios/, THIS_MONTH)).toHaveText('1.100,00')
    await expect(timelineCell(page, /^Vale E2E · VA E2E$/, NEXT_MONTH)).toHaveText('1.900,00')
    await expect(page.getByRole('row', { name: /Crédito VA E2E/ })).toHaveCount(0)

    await page.goto('/painel/contas')
    await expect(page.getByRole('row', { name: /^Total disponível/ })).toContainText('R$ 5.000')
    await expect(page.getByRole('row', { name: /^Total com benefícios/ })).toContainText('R$ 6.100')
  })

  test('create a monthly expense, then split it from next month on', async ({ page }) => {
    await page.goto('/painel/linha-do-tempo')
    await expect(page.getByRole('heading', { level: 1, name: 'Linha do tempo' })).toBeVisible()

    // Create a monthly expense through the N shortcut.
    await page.keyboard.press('n')
    const sheet = page.getByRole('dialog', { name: 'Novo lançamento' })
    await expect(sheet).toBeVisible()
    await sheet.getByLabel('Valor').fill('10000')
    await sheet.getByLabel('Descrição').fill('Aluguel E2E')
    await sheet
      .getByLabel('Data', { exact: true })
      .fill(`10/${THIS_MONTH.slice(5, 7)}/${THIS_MONTH.slice(0, 4)}`)
    await sheet.getByLabel('Repetição').click()
    await page.getByRole('option', { name: 'Mensal no dia 10' }).click()
    await sheet.getByRole('button', { name: 'Salvar', exact: true }).click()
    await expect(sheet).toBeHidden()

    // It shows in the timeline totals and in this month's day by day.
    await expect(expensesCell(page, THIS_MONTH)).toHaveText('-100,00')
    await expect(expensesCell(page, LATER_MONTH)).toHaveText('-100,00')
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
    await expect(edit.getByLabel('Valor')).toHaveValue('100,00')
    await edit.getByLabel('Valor').fill('15000')
    await edit.getByRole('button', { name: 'Salvar', exact: true }).click()

    const scope = page.getByRole('dialog', { name: 'Aplicar a mudança em…' })
    await expect(scope).toContainText('Aluguel E2E')
    await scope.getByLabel(/Este e os próximos/).check()
    await scope.getByRole('button', { name: 'Aplicar' }).click()
    await expect(edit).toBeHidden()

    // The split: this month keeps 100, next month on is 150.
    await expect(expensesCell(page, THIS_MONTH)).toHaveText('-100,00')
    await expect(expensesCell(page, NEXT_MONTH)).toHaveText('-150,00')
    await expect(expensesCell(page, LATER_MONTH)).toHaveText('-150,00')
    await expect(page.getByRole('row', { name: /Aluguel E2E/ })).toContainText('-R$ 150')
  })

  test('quick add on a calendar day, then pay it from its popup and see it in the week', async ({
    page,
  }) => {
    await page.goto('/painel?modo=mes')
    const create = page.locator('button[aria-current="date"]')
    const day = page.getByRole('group').filter({ has: create })
    // The end-of-day balance: the first money-only text of the day (before the chips' amounts).
    const balance = day.getByText(/^-?\d{1,3}(\.\d{3})*,\d{2}$/).first()
    const before = parseMoneyInput((await balance.textContent()) ?? '')
    await create.click()
    const form = page.getByRole('form', { name: 'Criar lançamento' })
    await expect(form.getByLabel('Descrição')).toBeFocused()
    await form.getByLabel('Descrição').fill('Padaria E2E')
    await form.getByLabel('Valor').fill('42,90')
    await form.getByLabel('Valor').press('Enter')
    await expect(form).toBeHidden()

    // The entry lands on that day and lowers the day's end balance by 42,90.
    const chip = day.getByRole('button', { name: /42,90 Padaria E2E/ })
    await expect(chip).toBeVisible()
    await expect(balance).toHaveText(formatAmount((before ?? 0) - 4290))

    // Its popup, like a Google Calendar event: details and "Marcar como pago".
    await chip.click()
    const details = page.getByLabel('Detalhes de Padaria E2E')
    await expect(details).toContainText('-R$ 42,90')
    await expect(details).toContainText('Banco E2E · Conta E2E')
    await details.getByRole('button', { name: 'Marcar como pago' }).click()
    await expect(details).toContainText('Pago em')
    await details.getByRole('button', { name: 'Fechar' }).click()
    await expect(chip).toHaveClass(/opacity-50/)

    // The week view (W) shows it too; "Criar" opens the full sheet.
    await page.keyboard.press('w')
    await expect(page.getByRole('button', { name: 'Visualização: Semana' })).toBeVisible()
    await expect(page.getByRole('button', { name: /42,90 Padaria E2E/ })).toBeVisible()
    await page.getByRole('button', { name: 'Criar', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'Novo lançamento' })).toBeVisible()
  })

  test('mark a bill paid in A pagar, then see it paid in the day by day', async ({
    page,
    user,
  }) => {
    // A one-off bill due today: unpaid, in "Próximos 7 dias".
    await fluxiDb
      .db()
      .insert(entries)
      .values({
        userId: user.id,
        kind: 'expense',
        description: 'Conta de luz E2E',
        amountCents: 23000,
        accountId,
        pot: 'essential',
        startMonth: monthToDate(THIS_MONTH),
        day: TODAY_DAY,
        recurrence: 'none',
      })

    await page.goto('/painel/a-pagar')
    await expect(page.getByRole('heading', { level: 1, name: 'A pagar' })).toBeVisible()
    const soon = page.getByRole('table', { name: /Próximos 7 dias/ })
    await expect(soon.getByRole('row', { name: /Conta de luz E2E/ })).toContainText('R$ 230')
    await soon.getByRole('button', { name: 'Pago: Conta de luz E2E' }).click()

    // It leaves the list (other tests of this worker's user may still have bills due)…
    await expect(page.getByRole('row', { name: /Conta de luz E2E/ })).toHaveCount(0)
    // …and shows as paid among this month's paid items.
    await page.getByLabel('Mostrar também os pagos deste mês').click()
    await expect(
      page.getByRole('table', { name: /Pagos neste mês/ }).getByRole('row', {
        name: /Conta de luz E2E/,
      }),
    ).toBeVisible()

    // The day by day shows it checked.
    await page
      .getByRole('navigation', { name: 'Seções' })
      .getByRole('link', {
        name: 'Linha do tempo',
      })
      .click()
    await expect(
      page.getByRole('heading', { name: `${monthLabel(THIS_MONTH)} dia a dia` }),
    ).toBeVisible()
    await expect(page.getByRole('checkbox', { name: 'Pago: Conta de luz E2E' })).toBeChecked()
  })
})
