import { fluxiDb } from '@/db'
import { accounts, banks, spaces } from '@/db/schema'
import { expect, test } from '@e2e/fixtures'
import { expectHydrated } from '@e2e/hydration'
import { and, eq } from 'drizzle-orm'

const SPACE = 'Freela E2E'

function firstRow<T>(rows: readonly T[], what: string): T {
  const [row] = rows
  if (row === undefined) throw new Error(`${what} not created`)
  return row
}

test.describe('spaces', () => {
  test.use({ authAsUser: true })

  // The E2E user lives for the whole worker: drop the spaces it created (their
  // ledger goes with them by cascade) so later specs start from Pessoal only.
  test.afterEach(async ({ user }) => {
    await fluxiDb
      .db()
      .delete(spaces)
      .where(and(eq(spaces.userId, user.id), eq(spaces.kind, 'business')))
  })

  test('an entry created in another space never shows in Pessoal', async ({ page, user }) => {
    await page.goto('/painel/transacoes')
    await expect(
      page.getByRole('button', { name: 'Espaço: Pessoal. Trocar de espaço e abrir a conta' }),
    ).toBeVisible()

    // "Novo espaço…" creates the space and switches to it.
    await page
      .getByRole('button', { name: 'Espaço: Pessoal. Trocar de espaço e abrir a conta' })
      .click()
    await page.getByRole('menuitem', { name: 'Novo espaço…' }).click()
    const dialog = page.getByRole('dialog', { name: 'Novo espaço' })
    await dialog.getByLabel('Nome').fill(SPACE)
    await dialog.getByRole('radio', { name: 'Freela' }).click()
    await dialog.getByRole('button', { name: 'Criar espaço' }).click()
    await expect(dialog).toBeHidden()
    await expect(
      page.getByRole('button', { name: `Espaço: ${SPACE}. Trocar de espaço e abrir a conta` }),
    ).toBeVisible()
    // No kind badge: the space is just its name and its icon.
    await expect(
      page.getByRole('button', { name: `Espaço: ${SPACE}. Trocar de espaço e abrir a conta` }),
    ).not.toContainText('Empresa')

    // The new space starts empty: give it an account of its own.
    const space = firstRow(
      await fluxiDb
        .db()
        .select({ id: spaces.id })
        .from(spaces)
        .where(and(eq(spaces.userId, user.id), eq(spaces.name, SPACE))),
      'space',
    )
    const owner = { userId: user.id, spaceId: space.id }
    const bank = firstRow(
      await fluxiDb
        .db()
        .insert(banks)
        .values({ ...owner, name: 'Banco PJ' })
        .returning(),
      'bank',
    )
    await fluxiDb
      .db()
      .insert(accounts)
      .values({ ...owner, bankId: bank.id, name: 'Conta PJ', type: 'checking' })
    await page.reload()
    await expect(
      page.getByRole('button', { name: `Espaço: ${SPACE}. Trocar de espaço e abrir a conta` }),
    ).toBeVisible()

    // The page streams in before it hydrates: the shortcut listens once it has.
    await expectHydrated(page.locator('[data-slot="sidebar-wrapper"]'))
    await page.keyboard.press('n')
    const sheet = page.getByRole('dialog', { name: 'Nova transação' })
    await expect(sheet).toBeVisible()
    await expect(sheet.getByLabel('Conta')).toContainText('Conta PJ')
    await sheet.getByLabel('Valor').fill('12345')
    await sheet.getByLabel('Descrição').fill('Nota fiscal E2E')
    await sheet.getByRole('button', { name: 'Salvar', exact: true }).click()
    await expect(sheet).toBeHidden()
    await expect(page.getByText('Nota fiscal E2E')).toBeVisible()

    // Back in Pessoal: nothing of the other space is there.
    await page
      .getByRole('button', { name: `Espaço: ${SPACE}. Trocar de espaço e abrir a conta` })
      .click()
    await page.getByRole('menuitem', { name: /Pessoal/ }).click()
    await expect(
      page.getByRole('button', { name: 'Espaço: Pessoal. Trocar de espaço e abrir a conta' }),
    ).toBeVisible()
    await expect(page.getByText('Nota fiscal E2E')).toHaveCount(0)
    await expectHydrated(page.locator('[data-slot="sidebar-wrapper"]'))
    await page.keyboard.press('n')
    const personal = page.getByRole('dialog', { name: 'Nova transação' })
    await expect(personal).toBeVisible()
    await expect(personal.getByLabel('Conta')).not.toContainText('Conta PJ')
  })

  test('renames a space and changes its icon', async ({ page }) => {
    await page.goto('/painel')
    const trigger = (name: string) =>
      page.getByRole('button', { name: `Espaço: ${name}. Trocar de espaço e abrir a conta` })
    await trigger('Pessoal').click()
    await page.getByRole('menuitem', { name: 'Novo espaço…' }).click()
    const create = page.getByRole('dialog', { name: 'Novo espaço' })
    await create.getByLabel('Nome').fill('Loja E2E')
    await create.getByRole('button', { name: 'Criar espaço' }).click()
    await expect(trigger('Loja E2E')).toBeVisible()

    await trigger('Loja E2E').click()
    await page.getByRole('menuitem', { name: 'Editar espaço…' }).click()
    const edit = page.getByRole('dialog', { name: 'Editar espaço' })
    await edit.getByLabel('Nome').fill('Casa E2E')
    await edit.getByRole('radio', { name: 'Casa' }).click()
    await edit.getByRole('button', { name: 'Salvar' }).click()
    await expect(edit).toBeHidden()
    await expect(trigger('Casa E2E')).toBeVisible()
    await trigger('Casa E2E').click()
    await expect(
      page.getByRole('menuitem', { name: /Casa E2E/ }).getByRole('img', { name: 'Ícone: Casa' }),
    ).toBeVisible()
  })
})
