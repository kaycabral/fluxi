import { fluxiDb } from '@/db'
import { accounts, banks, entries, occurrencePayments } from '@/db/schema'
import { isoDayOf } from '@/features/ledger/core/format'
import { addMonths, monthToDate } from '@/features/ledger/core/month'
import { addDays } from '@/features/ledger/core/payments'
import type { Scope } from '@/features/spaces/core/space'
import { expect, test } from '@e2e/fixtures'
import { and, eq } from 'drizzle-orm'

const TODAY = isoDayOf(new Date())
// Overdue, so the "Contas" widget opens on its tab.
const DUE = addDays(TODAY, -5)
// "Outra data…" picks the 1st of the previous month.
const PICKED = `${addMonths(TODAY.slice(0, 7), -1)}-01`

/** A one-off bill due 5 days ago; returns its entry id. */
async function seedOverdueBill(scope: Scope, description: string): Promise<string> {
  const db = fluxiDb.db()
  const [bank] = await db
    .insert(banks)
    .values({ ...scope, name: `Banco ${description}` })
    .returning()
  if (bank === undefined) throw new Error('bank not created')
  const [account] = await db
    .insert(accounts)
    .values({ ...scope, bankId: bank.id, name: 'Conta', type: 'checking', openingBalanceCents: 0 })
    .returning()
  if (account === undefined) throw new Error('account not created')
  const [entry] = await db
    .insert(entries)
    .values({
      ...scope,
      kind: 'expense',
      description,
      amountCents: -12300,
      accountId: account.id,
      budgetGroup: 'essential',
      startMonth: monthToDate(DUE.slice(0, 7)),
      day: Number(DUE.slice(8, 10)),
      recurrence: 'none',
    })
    .returning()
  if (entry === undefined) throw new Error('entry not created')
  return entry.id
}

async function paidOnOf(scope: Scope, entryId: string): Promise<string | undefined> {
  const [row] = await fluxiDb
    .db()
    .select({ paidOn: occurrencePayments.paidOn })
    .from(occurrencePayments)
    .where(
      and(eq(occurrencePayments.entryId, entryId), eq(occurrencePayments.userId, scope.userId)),
    )
  return row?.paidOn
}

test.describe('pay button dates', () => {
  test.use({ authAsUser: true })

  test('marks a bill paid "Ontem" from the Contas widget', async ({ page, user }) => {
    const entryId = await seedOverdueBill(user.scope, 'Boleto ontem E2E')
    await page.goto('/painel')
    await page.getByRole('button', { name: 'Mais opções: Boleto ontem E2E' }).click()
    const menu = page.getByRole('menu')
    await expect(menu.getByRole('menuitem', { name: /No vencimento/ })).toBeVisible()
    await menu.getByRole('menuitem', { name: /Ontem/ }).click()
    await expect(page.getByRole('button', { name: 'Mais opções: Boleto ontem E2E' })).toHaveCount(0)
    await expect.poll(() => paidOnOf(user.scope, entryId)).toBe(addDays(TODAY, -1))
  })

  test('"Outra data…" keeps the calendar open and pays on the picked day', async ({
    page,
    user,
  }) => {
    const entryId = await seedOverdueBill(user.scope, 'Boleto outra data E2E')
    await page.goto('/painel')
    await page.getByRole('button', { name: 'Mais opções: Boleto outra data E2E' }).click()
    await page.getByRole('menuitem', { name: /Outra data/ }).click()
    const picker = page.getByRole('dialog', { name: 'Pago em' })
    // The bug: the popover closed right after opening (never became visible).
    await expect(picker).toBeVisible()
    await expect(page.getByRole('menu')).toHaveCount(0)
    // Future days are disabled; go back a month and pick its 1st.
    await picker.getByRole('button', { name: /anterior/i }).click()
    await picker.locator(`[data-day="${PICKED}"] button`).first().click()
    await expect(picker).toHaveCount(0)
    await expect.poll(() => paidOnOf(user.scope, entryId)).toBe(PICKED)
  })
})
