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
import { and, eq, inArray, sql } from 'drizzle-orm'

/**
 * A brand-new user with a synced bank connection (synthetic feed written as
 * the sync would) gives it a space in Configurações → Conexões: its account
 * with movement is linked automatically (the empty one stays folded away),
 * the bank's transactions show in Transações with the "Vem do banco" mark,
 * read-only but categorizable; "Não vincular" is respected by the next sync.
 * Also archives an account in Configurações → Contas.
 * `E2E_SCREENSHOTS=<dir>` saves the screens for review.
 */

const ITEM = 'e2e-item'
/** Synthetic institution: the connection is named after its accounts ("Feedbank"). */
const BANK = 'Feedbank'
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

  test('auto-links a connection given a space, marks bank entries and respects "Não vincular"', async ({
    page,
    user,
  }) => {
    const db = fluxiDb.db()
    const today = isoDayOf(new Date())
    await db
      .insert(bankFeedItems)
      .values({ userId: user.id, itemId: ITEM, spaceId: null, label: 'MeuPluggy' })
    const feeds = await db
      .insert(bankFeedAccounts)
      .values(
        [
          { externalId: 'e2e-acc', name: `${BANK} Conta`, balanceCents: 100000 },
          { externalId: 'e2e-empty', name: `${BANK} Reserva`, balanceCents: 0 },
        ].map((f) => ({
          ...f,
          ...user.scope,
          source: 'pluggy',
          itemId: ITEM,
          institution: 'MeuPluggy',
          type: 'BANK',
          subtype: 'CHECKING_ACCOUNT',
          syncedAt: new Date(),
        })),
      )
      .returning()
    const feed = created(feeds, 'feed')
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

    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/painel#configuracoes/conexoes')
    const settings = page.getByRole('dialog', { name: 'Conexões' })
    await expect(settings.getByText(BANK, { exact: true })).toBeVisible()
    await expect(settings).not.toContainText('MeuPluggy')
    await settings.getByRole('combobox', { name: `Espaço de ${BANK}` }).click()
    await page.getByRole('option', { name: /Pessoal/ }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Mover' }).click()

    // Linked automatically to a new "Feedbank · Conta"; the empty one is folded.
    const accountsList = settings.getByRole('list', { name: `Contas de ${BANK}` })
    await expect(accountsList).toContainText(`→ ${BANK} · Conta`)
    await expect(accountsList).toContainText(/Saldo R\$\s1\.000,00/)
    await expect(settings.getByText('2 contas')).toBeVisible()
    await expect(settings.getByRole('button', { name: '+1 conta sem movimento' })).toBeVisible()
    await expect(settings.getByText('Reserva')).toHaveCount(0)
    const fits = () =>
      settings.evaluate((el) => {
        const content = el.querySelector('[aria-label="Conexões"]') ?? el
        return content.scrollWidth <= content.clientWidth + 1
      })
    expect(await fits()).toBe(true)
    await snap(page, 'ui4-conexoes-1280')
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await fits()).toBe(true)
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await snap(page, 'ui4-conexoes-390')
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.keyboard.press('Escape')

    await page.goto('/painel/transacoes')
    const row = page.getByRole('listitem').filter({ hasText: 'Padaria Feed E2E' })
    await expect(row.getByRole('img', { name: 'Vem do banco' })).toBeVisible()
    await snap(page, 'ui4-transacoes')
    await page.getByText('Padaria Feed E2E').click()
    const sheet = page.getByRole('dialog', { name: 'Editar transação' })
    await expect(
      sheet.getByText('Vem do banco: valor, data e conta não podem ser alterados.'),
    ).toBeVisible()
    await expect(sheet.getByLabel('Valor', { exact: true })).toBeDisabled()
    await expect(sheet.getByLabel('Data', { exact: true })).toBeDisabled()
    await expect(sheet.getByRole('button', { name: 'Excluir' })).toHaveCount(0)
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

    // "Não vincular" by hand: the bank entries go, and the next sync keeps it so.
    await page.goto('about:blank')
    await page.goto('/painel#configuracoes/conexoes')
    const again = page.getByRole('dialog', { name: 'Conexões' })
    const label = `${BANK} · Conta`
    await again.getByRole('button', { name: `Trocar conta de ${label}` }).click()
    await again.getByRole('combobox', { name: `Conta no Fluxi de ${label}` }).click()
    await page.getByRole('option', { name: 'Não vincular' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Desvincular' }).click()
    await expect(again.getByText('Não vinculada: não aparece no Fluxi')).toBeVisible()
    await db.execute(
      sql`select private.materialize_bank_feed(${user.id}::uuid, ${user.scope.spaceId}::uuid, ${today}::date)`,
    )
    const [kept] = await db
      .select({ accountId: bankFeedAccounts.accountId, source: bankFeedAccounts.mappingSource })
      .from(bankFeedAccounts)
      .where(eq(bankFeedAccounts.id, feed.id))
    expect(kept).toEqual({ accountId: null, source: 'manual' })
    await page.goto('/painel/transacoes')
    await expect(page.getByRole('main').first()).toBeVisible()
    await expect(page.getByText('Padaria Feed E2E')).toHaveCount(0)
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
      await page.goto('/painel/transacoes')
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

    await page.goto('/painel/transacoes')
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
