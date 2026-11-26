import { fluxiDb } from '@/db'
import { accounts, banks, entries } from '@/db/schema'
import {
  bankEntryLinks,
  bankFeedAccounts,
  bankFeedItems,
  bankTransactions,
} from '@/db/schema-bank-feed'
import { isoDayOf } from '@/features/ledger/core/format'
import { addDays } from '@/features/ledger/core/payments'
import { expect, test } from '@e2e/fixtures'
import type { Page } from '@playwright/test'
import { and, eq, inArray, sql } from 'drizzle-orm'

/**
 * The merchant is extra information: a bank entry keeps the bank's
 * description ("Compra no débito autorizada") and shows the merchant Pluggy
 * identified next to it, in Transações and in the sheet.
 * `E2E_SCREENSHOTS=<dir>` saves the screens for review.
 */

const ITEM = 'e2e-merchant-item'
const BANK = 'Merchbank'
const GENERIC = 'Compra no débito autorizada'
const shots = process.env.E2E_SCREENSHOTS ?? null

async function snap(page: Page, name: string): Promise<void> {
  if (shots !== null) await page.screenshot({ path: `${shots}/${name}.png` })
}

function created<T>(rows: readonly T[], what: string): T {
  const [row] = rows
  if (row === undefined) throw new Error(`${what} not created`)
  return row
}

test.describe('merchant as extra information', () => {
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

  test('keeps the bank description and shows the merchant next to it', async ({ page, user }) => {
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
    await db.insert(bankFeedItems).values({
      userId: user.id,
      itemId: ITEM,
      spaceId: user.scope.spaceId,
      spaceSource: 'manual',
      label: BANK,
    })
    const feed = created(
      await db
        .insert(bankFeedAccounts)
        .values({
          ...user.scope,
          source: 'pluggy',
          externalId: 'e2e-merchant-acc',
          itemId: ITEM,
          institution: BANK,
          name: `${BANK} Conta`,
          type: 'BANK',
          subtype: 'CHECKING_ACCOUNT',
          balanceCents: 100000,
          accountId: account.id,
          mappingSource: 'manual',
          syncedAt: new Date(),
        })
        .returning(),
      'feed',
    )
    await db.insert(bankTransactions).values(
      [
        { externalId: 'm1', amountCents: -1250, merchantName: 'Padaria Veneza', daysAgo: 1 },
        { externalId: 'm2', amountCents: -4890, merchantName: 'Drogaria Central', daysAgo: 2 },
        { externalId: 'm3', amountCents: -990, merchantName: null, daysAgo: 3 },
      ].map(({ daysAgo, ...t }) => ({
        ...user.scope,
        ...t,
        feedAccountId: feed.id,
        description: GENERIC,
        date: addDays(today, -daysAgo),
        status: 'POSTED',
        category: 'Shopping',
        operationType: 'CARTAO',
        syncedAt: new Date(),
      })),
    )
    await db.execute(
      sql`select private.materialize_bank_feed(${user.id}::uuid, ${user.scope.spaceId}::uuid, ${today}::date)`,
    )
    const own = await db
      .select({ description: entries.description })
      .from(entries)
      .innerJoin(bankEntryLinks, eq(bankEntryLinks.entryId, entries.id))
      .where(eq(entries.userId, user.id))
    expect(own.map((e) => e.description)).toEqual([GENERIC, GENERIC, GENERIC])

    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/painel/transacoes')
    const row = page.getByRole('button').filter({ hasText: 'Padaria Veneza' })
    await expect(row).toContainText(GENERIC)
    await expect(row).toContainText(`Padaria Veneza · ${BANK}`)
    // Search finds the merchant.
    await page.getByRole('searchbox').fill('drogaria')
    await expect(page.getByText(/Drogaria Central ·/)).toBeVisible()
    await expect(page.getByText(/Padaria Veneza ·/)).toBeHidden()
    await page.getByRole('searchbox').fill('')
    await expect(page.getByText(/Padaria Veneza ·/)).toBeVisible()
    await snap(page, 'ui10-transacoes')

    await page.getByText(/Padaria Veneza ·/).click()
    const sheet = page.getByRole('dialog', { name: 'Editar transação' })
    await expect(sheet.getByText('Estabelecimento:')).toBeVisible()
    await expect(sheet.getByText('Padaria Veneza')).toBeVisible()
    await expect(sheet.getByLabel('Descrição')).toHaveValue(GENERIC)
    await snap(page, 'ui10-sheet')
  })
})
