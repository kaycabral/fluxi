import { fluxiDb } from '@/db'
import { accounts, banks, entries } from '@/db/schema'
import {
  bankEntryLinks,
  bankFeedAccounts,
  bankFeedItems,
  bankTransactions,
} from '@/db/schema-bank-feed'
import { isoDayOf } from '@/features/ledger/core/format'
import { monthToDate } from '@/features/ledger/core/month'
import { addDays } from '@/features/ledger/core/payments'
import { expect, test } from '@e2e/fixtures'
import type { Page } from '@playwright/test'
import { and, eq, inArray } from 'drizzle-orm'

/**
 * A brand-new user with a synced bank connection (synthetic feed written as
 * the sync would) maps it in Configurações → Conexões, sees the bank's
 * transactions in Lançamentos, cannot change what the bank owns, can
 * categorize; and archives an account in Configurações → Contas.
 * `E2E_SCREENSHOTS=<dir>` saves the screens for review.
 */

const ITEM = 'e2e-item'
const BANK = 'Banco Feed E2E'
const FEED_ACCOUNT = 'Conta Corrente E2E'
const shots = process.env.E2E_SCREENSHOTS ?? null

/** Saves the screen for review when `E2E_SCREENSHOTS` names a folder. */
async function snap(page: Page, name: string): Promise<void> {
  if (shots !== null) await page.screenshot({ path: `${shots}/${name}.png` })
}

function created<T>(rows: readonly T[], what: string): T {
  const [row] = rows
  if (row === undefined) throw new Error(`${what} not created`)
  return row
}

test.describe('bank feed in the ledger', () => {
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
    await db.delete(bankFeedAccounts).where(eq(bankFeedAccounts.userId, user.id))
    await db.delete(bankFeedItems).where(eq(bankFeedItems.userId, user.id))
    const created = await db
      .select({ id: banks.id })
      .from(banks)
      .where(and(eq(banks.userId, user.id), inArray(banks.name, [BANK, 'Arquivo E2E'])))
    const bankIds = created.map((b) => b.id)
    if (bankIds.length > 0) {
      const owned = await db
        .select({ id: accounts.id })
        .from(accounts)
        .where(inArray(accounts.bankId, bankIds))
      const accountIds = owned.map((a) => a.id)
      if (accountIds.length > 0)
        await db.delete(entries).where(inArray(entries.accountId, accountIds))
      await db.delete(accounts).where(inArray(accounts.bankId, bankIds))
      await db.delete(banks).where(inArray(banks.id, bankIds))
    }
  })

  test('maps a bank account, shows its transactions read-only and lets them be categorized', async ({
    page,
    user,
  }) => {
    const db = fluxiDb.db()
    const today = isoDayOf(new Date())
    await db
      .insert(bankFeedItems)
      .values({ userId: user.id, itemId: ITEM, spaceId: user.scope.spaceId, label: BANK })
    const feed = created(
      await db
        .insert(bankFeedAccounts)
        .values({
          ...user.scope,
          source: 'pluggy',
          externalId: 'e2e-acc',
          itemId: ITEM,
          institution: 'MeuPluggy',
          name: FEED_ACCOUNT,
          type: 'BANK',
          subtype: 'CHECKING_ACCOUNT',
          balanceCents: 100000,
          syncedAt: new Date(),
        })
        .returning(),
      'feed',
    )
    await db.insert(bankTransactions).values(
      [
        { externalId: 't1', amountCents: -4500, description: 'Padaria Feed E2E' },
        { externalId: 't2', amountCents: 20000, description: 'Pix recebido Feed E2E' },
      ].map((t) => ({
        ...t,
        ...user.scope,
        feedAccountId: feed.id,
        date: addDays(today, -2),
        status: 'POSTED',
        syncedAt: new Date(),
      })),
    )

    await page.goto('/painel#configuracoes/conexoes')
    const settings = page.getByRole('dialog', { name: 'Conexões' })
    await expect(settings.getByText(/Conta · saldo no banco R\$\s1\.000,00/)).toBeVisible()
    await settings.getByRole('combobox', { name: `Conta no Fluxi de ${FEED_ACCOUNT}` }).click()
    await page.getByRole('option', { name: 'Criar conta' }).click()
    await expect(
      settings.getByRole('combobox', { name: `Conta no Fluxi de ${FEED_ACCOUNT}` }),
    ).toContainText(`${BANK} · ${FEED_ACCOUNT}`)
    await snap(page, 'ui3-conexoes')
    await page.keyboard.press('Escape')

    await page.goto('/painel/lancamentos')
    await page.getByText('Padaria Feed E2E').click()
    const sheet = page.getByRole('dialog', { name: 'Editar lançamento' })
    await expect(
      sheet.getByText('Vem do banco: valor, data e conta não podem ser alterados.'),
    ).toBeVisible()
    await expect(sheet.getByLabel('Valor', { exact: true })).toBeDisabled()
    await expect(sheet.getByLabel('Data', { exact: true })).toBeDisabled()
    await expect(sheet.getByRole('button', { name: 'Excluir' })).toHaveCount(0)
    await snap(page, 'ui3-bank-entry')
    await sheet.getByLabel('Categoria').click()
    await page
      .getByRole('option', { name: /Padaria/ })
      .first()
      .click()
    await sheet.getByRole('button', { name: 'Salvar', exact: true }).click()
    await expect(sheet).toBeHidden()

    const [saved] = await db
      .select({ categoryId: entries.categoryId, amountCents: entries.amountCents })
      .from(entries)
      .where(and(eq(entries.userId, user.id), eq(entries.description, 'Padaria Feed E2E')))
    expect(saved?.categoryId).not.toBeNull()
    expect(saved?.amountCents).toBe(-4500)
  })

  test('archives an account: it and its entries stop counting until unarchived', async ({
    page,
    user,
  }) => {
    const db = fluxiDb.db()
    const today = isoDayOf(new Date())
    const bank = created(
      await db
        .insert(banks)
        .values({ ...user.scope, name: 'Arquivo E2E' })
        .returning(),
      'bank',
    )
    const account = created(
      await db
        .insert(accounts)
        .values({
          ...user.scope,
          bankId: bank.id,
          name: 'Velha E2E',
          type: 'checking',
          openingBalanceCents: 50000,
        })
        .returning(),
      'account',
    )
    await db.insert(entries).values({
      ...user.scope,
      kind: 'expense',
      description: 'Gasto Arquivo E2E',
      amountCents: -12345,
      accountId: account.id,
      startMonth: monthToDate(today.slice(0, 7)),
      day: 1,
      recurrence: 'none',
    })
    const todayBalance = page.locator('[data-slot="card"]', { hasText: 'Saldo hoje' })
    const counted = async () => {
      await page.goto('/painel/lancamentos')
      await expect(page.getByText('Gasto Arquivo E2E').first()).toBeVisible()
      await page.goto('/painel')
      // 500,00 opening − 123,45 on the 1st.
      await expect(todayBalance).toContainText(/376,55/)
    }
    await counted()

    // A hash-only change from /painel would not reload the page.
    await page.goto('about:blank')
    await page.goto('/painel#configuracoes/contas')
    const settings = page.getByRole('dialog', { name: 'Contas' })
    await expect(settings.getByRole('region', { name: 'Arquivo E2E' })).toBeVisible()
    await snap(page, 'ui3-contas')
    await settings.getByRole('button', { name: 'Arquivar Velha E2E' }).click()
    const confirm = page.getByRole('alertdialog')
    await expect(confirm).toContainText('deixam de contar em qualquer lugar')
    await confirm.getByRole('button', { name: 'Arquivar' }).click()
    await expect(settings.getByRole('button', { name: /Arquivadas/ })).toBeVisible()
    await expect
      .poll(async () => {
        const [row] = await db
          .select({ archivedAt: accounts.archivedAt })
          .from(accounts)
          .where(eq(accounts.id, account.id))
        return row?.archivedAt !== null
      })
      .toBe(true)

    await page.goto('/painel/lancamentos')
    await expect(page.getByRole('main').first()).toBeVisible()
    await expect(page.getByText('Gasto Arquivo E2E')).toHaveCount(0)
    await page.goto('/painel')
    await expect(todayBalance).not.toContainText(/376,55/)

    await page.goto('about:blank')
    await page.goto('/painel#configuracoes/contas')
    const again = page.getByRole('dialog', { name: 'Contas' })
    await again.getByRole('button', { name: /Arquivadas/ }).click()
    await again.getByRole('button', { name: 'Desarquivar Velha E2E' }).click()
    await expect(again.getByRole('region', { name: 'Arquivo E2E' })).toBeVisible()
    await counted()
  })
})
