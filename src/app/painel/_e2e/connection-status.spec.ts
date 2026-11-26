import { fluxiDb } from '@/db'
import { bankFeedItems } from '@/db/schema-bank-feed'
import { expect, test } from '@e2e/fixtures'
import type { Page } from '@playwright/test'
import { eq } from 'drizzle-orm'

/**
 * Configurações → Conexões shows each connection's sign of life (the health
 * the sync recorded): a dot named by its reason, with the reason on hover.
 * Synthetic data only. `E2E_SCREENSHOTS=<dir>` saves the screen for review.
 */

const shots = process.env.E2E_SCREENSHOTS ?? null
const HOUR = 3_600_000

/** Saves the screen for review when `E2E_SCREENSHOTS` names a folder. */
async function snap(page: Page): Promise<void> {
  if (shots !== null) await page.screenshot({ path: `${shots}/ui15-conexoes.png` })
}

test.describe('connection status', () => {
  test.use({ authAsUser: true })

  test.afterEach(async ({ user }) => {
    await fluxiDb.db().delete(bankFeedItems).where(eq(bankFeedItems.userId, user.id))
  })

  test('shows a health dot per connection with its reason', async ({ page, user }) => {
    const now = Date.now()
    const checked = new Date(now - HOUR)
    await fluxiDb
      .db()
      .insert(bankFeedItems)
      .values([
        {
          itemId: 'e2e-ok',
          label: 'Feedbank',
          ...user.scope,
          spaceSource: 'manual',
          itemStatus: 'UPDATED',
          institutionHealth: 'ONLINE',
          lastUpdatedAt: new Date(now - 2 * HOUR),
          nextSyncAt: new Date(now + 20 * HOUR),
          checkedAt: checked,
        },
        {
          itemId: 'e2e-warn',
          label: 'Feedcard',
          ...user.scope,
          spaceSource: 'manual',
          itemStatus: 'UPDATING',
          checkedAt: checked,
        },
        {
          itemId: 'e2e-error',
          label: 'Feedcred',
          ...user.scope,
          spaceSource: 'manual',
          itemStatus: 'LOGIN_ERROR',
          errorCode: 'INVALID_CREDENTIALS',
          checkedAt: checked,
        },
      ])

    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/painel#configuracoes/conexoes')
    const settings = page.getByRole('dialog', { name: 'Conexões' })
    await expect(
      settings.getByRole('button', {
        name: /^Conexão: Atualizada (hoje|ontem) às .*Próxima atualização/,
      }),
    ).toBeVisible()
    await expect(
      settings.getByRole('button', { name: 'Conexão: Atualizando agora…' }),
    ).toBeVisible()
    const reconnect = settings.getByRole('button', {
      name: 'Conexão: O banco pediu nova autorização: reconecte no Meu Pluggy',
    })
    await reconnect.hover()
    await expect(page.getByRole('tooltip')).toContainText('reconecte no Meu Pluggy')
    await snap(page)
  })
})
