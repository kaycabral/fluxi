import { fluxiDb } from '@/db'
import { accounts, banks, categories, entries } from '@/db/schema'
import {
  bankEntryLinks,
  bankFeedAccounts,
  bankFeedItems,
  bankTransactions,
  categorizationRules,
} from '@/db/schema-bank-feed'
import { isoDayOf } from '@/features/ledger/core/format'
import { addDays } from '@/features/ledger/core/payments'
import { expect, test } from '@e2e/fixtures'
import type { Page } from '@playwright/test'
import { and, eq, inArray, like, sql } from 'drizzle-orm'

/**
 * Categorize once, replicate: a synthetic bank feed with a few "ATM VENEZA"
 * card payments. Categorizing one offers the others (the small ones checked,
 * the big one not), "Fazer isso sozinho" records a rule that categorizes a
 * new similar bank transaction on the next materialization; the rule shows
 * in Configurações → Regras, the account's last digits in Conexões. Then the
 * multi-select of Lançamentos sets the pot of two entries.
 * `E2E_SCREENSHOTS=<dir>` saves the screens for review.
 */

const ITEM = 'e2e-categorize-item'
const BANK = 'Catbank'
const shots = process.env.E2E_SCREENSHOTS ?? null

async function snap(page: Page, name: string): Promise<void> {
  if (shots !== null) await page.screenshot({ path: `${shots}/${name}.png` })
}

function created<T>(rows: readonly T[], what: string): T {
  const [row] = rows
  if (row === undefined) throw new Error(`${what} not created`)
  return row
}

test.describe('categorize once, replicate', () => {
  test.use({ authAsUser: true })

  test.afterEach(async ({ user }) => {
    const db = fluxiDb.db()
    const linked = await db
      .select({ entryId: bankEntryLinks.entryId })
      .from(bankEntryLinks)
      .where(eq(bankEntryLinks.userId, user.id))
    await db.delete(bankEntryLinks).where(eq(bankEntryLinks.userId, user.id))
    const ids = linked.flatMap((l) => (l.entryId === null ? [] : [l.entryId]))
    if (ids.length > 0) await db.delete(entries).where(inArray(entries.id, ids))
    await db.delete(categorizationRules).where(eq(categorizationRules.userId, user.id))
    await db.delete(bankFeedAccounts).where(eq(bankFeedAccounts.userId, user.id))
    await db.delete(bankFeedItems).where(eq(bankFeedItems.userId, user.id))
    const own = await db
      .select({ id: banks.id })
      .from(banks)
      .where(and(eq(banks.userId, user.id), eq(banks.name, BANK)))
    const bankIds = own.map((b) => b.id)
    if (bankIds.length > 0) {
      await db.delete(accounts).where(inArray(accounts.bankId, bankIds))
      await db.delete(banks).where(inArray(banks.id, bankIds))
    }
  })

  test('applies to similar entries, learns a rule and sets the pot of a selection', async ({
    page,
    user,
  }) => {
    const db = fluxiDb.db()
    const today = isoDayOf(new Date())
    const bank = created(
      await db
        .insert(banks)
        .values({ ...user.scope, name: BANK })
        .returning(),
      'bank',
    )
    const account = created(
      await db
        .insert(accounts)
        .values({
          ...user.scope,
          bankId: bank.id,
          name: 'Conta',
          type: 'checking',
          openingBalanceCents: 0,
        })
        .returning(),
      'account',
    )
    await db
      .insert(bankFeedItems)
      .values({ userId: user.id, itemId: ITEM, spaceId: user.scope.spaceId, label: BANK })
    const feed = created(
      await db
        .insert(bankFeedAccounts)
        .values({
          ...user.scope,
          source: 'pluggy',
          externalId: 'e2e-cat-acc',
          itemId: ITEM,
          institution: BANK,
          name: `${BANK} Conta`,
          type: 'BANK',
          subtype: 'CHECKING_ACCOUNT',
          balanceCents: 100000,
          numberHint: '1234',
          accountId: account.id,
          mappingSource: 'manual',
          syncedAt: new Date(),
        })
        .returning(),
      'feed',
    )
    const transaction = (externalId: string, amountCents: number, daysAgo: number) => ({
      ...user.scope,
      feedAccountId: feed.id,
      externalId,
      amountCents,
      description: `ATM VENEZA ${externalId}`,
      date: addDays(today, -daysAgo),
      status: 'POSTED',
      category: 'Shopping',
      operationType: 'CARTAO',
      syncedAt: new Date(),
    })
    await db
      .insert(bankTransactions)
      .values([
        transaction('0001', -1000, 1),
        transaction('0002', -1200, 2),
        transaction('0003', -900, 3),
        transaction('0004', -35000, 4),
      ])
    const materialize = () =>
      db.execute(
        sql`select private.materialize_bank_feed(${user.id}::uuid, ${user.scope.spaceId}::uuid, ${today}::date)`,
      )
    await materialize()
    const atm = () =>
      db
        .select()
        .from(entries)
        .where(and(eq(entries.userId, user.id), like(entries.description, 'ATM VENEZA %')))
        .orderBy(entries.description)

    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/painel#configuracoes/conexoes')
    const connections = page.getByRole('dialog', { name: 'Conexões' })
    await expect(connections.getByText('••1234')).toBeVisible()
    await snap(page, 'ui5-conexoes-hint')

    // Categorize the reference: the similar ones come up.
    await page.goto('about:blank')
    await page.goto('/painel/lancamentos')
    await page.getByText('ATM VENEZA 0001').click()
    const sheet = page.getByRole('dialog', { name: 'Editar lançamento' })
    await sheet.getByLabel('Categoria').click()
    await page.getByRole('option', { name: 'Padaria', exact: true }).click()
    await sheet.getByRole('button', { name: 'Salvar', exact: true }).click()

    const similar = page.getByRole('dialog', { name: 'Aplicar a outros 3 lançamentos parecidos?' })
    await expect(similar).toBeVisible()
    const item = (amount: RegExp) =>
      similar.getByRole('listitem').filter({ hasText: amount }).getByRole('checkbox')
    await expect(item(/12,00/)).toBeChecked()
    await expect(item(/9,00/)).toBeChecked()
    await expect(item(/350,00/)).not.toBeChecked()
    await similar.getByLabel('Fazer isso sozinho daqui para frente').click()
    await snap(page, 'ui5-similar-dialog')
    await similar.getByRole('button', { name: 'Aplicar a 2' }).click()
    await expect(similar).toBeHidden()

    const [padaria] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.spaceId, user.scope.spaceId), eq(categories.name, 'Padaria')))
    const byDescription = async () =>
      Object.fromEntries((await atm()).map((e) => [e.description, e.categoryId]))
    await expect.poll(byDescription).toEqual({
      'ATM VENEZA 0001': padaria?.id,
      'ATM VENEZA 0002': padaria?.id,
      'ATM VENEZA 0003': padaria?.id,
      'ATM VENEZA 0004': null,
    })
    const rules = await db
      .select()
      .from(categorizationRules)
      .where(eq(categorizationRules.userId, user.id))
    expect(rules).toMatchObject([{ pattern: 'atm veneza', minCents: 900, maxCents: 1200 }])

    // A new similar transaction arrives: the next materialization categorizes it.
    await db.insert(bankTransactions).values(transaction('0005', -1100, 0))
    await materialize()
    expect((await byDescription())['ATM VENEZA 0005']).toBe(padaria?.id)

    await page.goto('about:blank')
    await page.goto('/painel#configuracoes/regras')
    const rulesDialog = page.getByRole('dialog', { name: 'Regras' })
    await expect(rulesDialog.getByText('“atm veneza”')).toBeVisible()
    await expect(rulesDialog.getByText(/R\$\s9,00 a R\$\s12,00 → Padaria/)).toBeVisible()
    await snap(page, 'ui5-rules')

    // Multi-select: the pot of two entries at once.
    await page.goto('about:blank')
    await page.goto('/painel/lancamentos')
    await page.getByRole('button', { name: 'Selecionar' }).click()
    await page.getByRole('checkbox', { name: 'Selecionar ATM VENEZA 0004' }).click()
    await page.getByRole('checkbox', { name: 'Selecionar ATM VENEZA 0005' }).click()
    const bar = page.getByRole('toolbar', { name: 'Ações da seleção' })
    await expect(bar).toContainText('2 selecionados')
    await bar.getByRole('combobox', { name: 'Pote da seleção' }).click()
    await page.getByRole('option', { name: 'Conforto' }).click()
    await expect(bar).toContainText('Pote aplicado a 2.')
    await snap(page, 'ui5-multiselect')
    await expect
      .poll(async () => Object.fromEntries((await atm()).map((e) => [e.description, e.pot])))
      .toMatchObject({ 'ATM VENEZA 0004': 'comfort', 'ATM VENEZA 0005': 'comfort' })
    const [big] = (await atm()).filter((e) => e.description === 'ATM VENEZA 0004')
    expect(big).toMatchObject({ amountCents: -35000, categoryId: null })
  })
})
