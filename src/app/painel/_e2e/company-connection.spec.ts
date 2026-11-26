import { fluxiDb } from '@/db'
import { spaces } from '@/db/schema'
import { bankFeedItems } from '@/db/schema-bank-feed'
import { expect, test } from '@e2e/fixtures'
import type { Page } from '@playwright/test'
import { and, eq, ne } from 'drizzle-orm'

/**
 * A new user's company connection the sync could not route (unknown CNPJ)
 * waits in Configurações → Conexões with a suggested space: one click creates
 * the space and routes the connection there, as the user's (manual) choice.
 * Synthetic data only. `E2E_SCREENSHOTS=<dir>` saves the screen for review.
 */

const ITEM = 'e2e-company-item'
const INSTITUTION = 'Feedbank Empresas'
const SUGGESTED = 'Feedbank Comércio E2E'
const shots = process.env.E2E_SCREENSHOTS ?? null

/** Saves the screen for review when `E2E_SCREENSHOTS` names a folder. */
async function snap(page: Page): Promise<void> {
  if (shots !== null) await page.screenshot({ path: `${shots}/ui13-conexoes.png` })
}

test.describe('company connection', () => {
  test.use({ authAsUser: true })

  test.afterEach(async ({ user }) => {
    const db = fluxiDb.db()
    await db.delete(bankFeedItems).where(eq(bankFeedItems.userId, user.id))
    // Spaces are never deleted, only archived.
    await db
      .update(spaces)
      .set({ archivedAt: new Date() })
      .where(and(eq(spaces.userId, user.id), ne(spaces.kind, 'personal')))
  })

  test('creates the suggested space in one click and routes the connection to it', async ({
    page,
    user,
  }) => {
    const db = fluxiDb.db()
    await db.insert(bankFeedItems).values({
      userId: user.id,
      itemId: ITEM,
      spaceId: null,
      label: INSTITUTION,
      suggestedSpaceName: SUGGESTED,
    })

    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/painel#configuracoes/conexoes')
    const settings = page.getByRole('dialog', { name: 'Conexões' })
    await expect(settings.getByText(INSTITUTION, { exact: true })).toBeVisible()
    await expect(settings.getByText('Conta de empresa.', { exact: false })).toBeVisible()
    await snap(page)

    await settings.getByRole('button', { name: `Criar espaço “${SUGGESTED}”` }).click()
    await expect(page.getByText(`Espaço “${SUGGESTED}” criado.`)).toBeVisible()
    await expect(
      settings.getByRole('combobox', { name: `Espaço de ${INSTITUTION}` }),
    ).toContainText(SUGGESTED)
    await expect(settings.getByRole('button', { name: /Criar espaço/ })).toHaveCount(0)

    const [item] = await db.select().from(bankFeedItems).where(eq(bankFeedItems.userId, user.id))
    const [space] = await db
      .select()
      .from(spaces)
      .where(and(eq(spaces.userId, user.id), eq(spaces.name, SUGGESTED)))
    expect(space).toMatchObject({ kind: 'business', icon: 'building-2', archivedAt: null })
    expect(item).toMatchObject({
      spaceId: space?.id,
      spaceSource: 'manual',
      suggestedSpaceName: null,
    })
  })
})
