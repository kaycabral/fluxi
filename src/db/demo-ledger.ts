import { addMonths, monthToDate, type Month } from '@/features/ledger/core/month'
import type { Scope } from '@/features/spaces/core/space'
import { and, eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { FluxiDb } from './db'
import { accounts, banks, categories, entries, entryParts } from './schema'

/**
 * Demo ledger for the LOCAL dev user, shaped like the validated prototype
 * (BTG/Nubank/Flash, salary with an advance split, recurring bills, a yearly
 * IPVA, a 12-installment buffet). Months are relative to `start` (the count
 * start), so the app always looks alive around "today". Local dev only.
 */
export async function seedDemoLedger(db: FluxiDb, scope: Scope, start: Month): Promise<void> {
  const owner = { userId: scope.userId, spaceId: scope.spaceId }
  const at = (offset: number) => monthToDate(addMonths(start, offset))
  const id = () => randomUUID()

  const btg = id()
  const nu = id()
  const flash = id()
  await db.insert(banks).values([
    { id: btg, ...owner, name: 'BTG Pactual', sort: 0 },
    { id: nu, ...owner, name: 'Nubank', sort: 1 },
    { id: flash, ...owner, name: 'Flash', sort: 2 },
  ])
  const btgcc = id()
  const btgcard = id()
  const nucc = id()
  const flashva = id()
  await db.insert(accounts).values([
    {
      id: btgcc,
      ...owner,
      bankId: btg,
      name: 'Conta corrente',
      type: 'checking',
      openingBalanceCents: 640000,
    },
    {
      id: btgcard,
      ...owner,
      bankId: btg,
      name: 'Cartão Black',
      type: 'credit',
      openingBalanceCents: 0,
    },
    {
      id: nucc,
      ...owner,
      bankId: nu,
      name: 'Conta',
      type: 'checking',
      openingBalanceCents: 120000,
    },
    {
      id: flashva,
      ...owner,
      bankId: flash,
      name: 'Vale-alimentação',
      type: 'benefit',
      openingBalanceCents: 31000,
    },
  ])

  const cats = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(and(eq(categories.userId, scope.userId), eq(categories.spaceId, scope.spaceId)))
  const cat = (name: string) => {
    const found = cats.find((c) => c.name === name)
    if (found === undefined) throw new Error(`category not seeded: ${name}`)
    return found.id
  }

  type Row = typeof entries.$inferInsert
  const base = (row: Omit<Row, 'userId' | 'spaceId' | 'id'> & { id?: string }): Row => ({
    id: row.id ?? id(),
    ...owner,
    ...row,
  })
  const salaryNow = id()
  const salaryNext = id()
  const rows: Row[] = [
    base({
      kind: 'income',
      description: 'Salário',
      categoryId: cat('Salário'),
      accountId: btgcc,
      amountCents: 1060000,
      day: 30,
      startMonth: at(-3),
      endMonth: at(-1),
      recurrence: 'monthly',
    }),
    base({
      id: salaryNow,
      kind: 'income',
      description: 'Salário',
      categoryId: cat('Salário'),
      accountId: btgcc,
      amountCents: 1140000,
      day: 5,
      startMonth: at(0),
      endMonth: at(4),
      recurrence: 'monthly',
      tags: ['trabalho'],
    }),
    base({
      id: salaryNext,
      kind: 'income',
      description: 'Salário',
      categoryId: cat('Salário'),
      accountId: btgcc,
      amountCents: 1210000,
      day: 5,
      startMonth: at(5),
      recurrence: 'monthly',
      tags: ['trabalho'],
    }),
    base({
      kind: 'income',
      description: '13º salário',
      categoryId: cat('Décimo terceiro'),
      accountId: btgcc,
      amountCents: 780000,
      day: 18,
      startMonth: at(0),
      recurrence: 'yearly',
      tags: ['trabalho'],
    }),
    base({
      kind: 'income',
      description: 'Vale-alimentação',
      categoryId: cat('Benefícios'),
      accountId: flashva,
      amountCents: 90000,
      day: 1,
      startMonth: at(-3),
      recurrence: 'monthly',
    }),
    base({
      kind: 'expense',
      description: 'Financiamento do apartamento',
      categoryId: cat('Financiamento de imóvel'),
      budgetGroup: 'essential',
      accountId: btgcc,
      amountCents: -245000,
      day: 10,
      startMonth: at(-3),
      recurrence: 'monthly',
      tags: ['casa'],
    }),
    base({
      kind: 'expense',
      description: 'Mercado (VA)',
      categoryId: cat('Supermercado e mercearia'),
      budgetGroup: 'essential',
      accountId: flashva,
      amountCents: -90000,
      day: 6,
      startMonth: at(-3),
      recurrence: 'monthly',
    }),
    base({
      kind: 'expense',
      description: 'Mercado complemento',
      categoryId: cat('Supermercado e mercearia'),
      budgetGroup: 'essential',
      accountId: btgcc,
      amountCents: -30000,
      day: 20,
      startMonth: at(0),
      recurrence: 'monthly',
    }),
    base({
      kind: 'expense',
      description: 'Luz',
      categoryId: cat('Energia elétrica'),
      budgetGroup: 'essential',
      accountId: btgcc,
      amountCents: -26000,
      day: 15,
      startMonth: at(-3),
      recurrence: 'monthly',
      tags: ['casa'],
    }),
    base({
      kind: 'expense',
      description: 'Internet',
      categoryId: cat('Internet'),
      budgetGroup: 'essential',
      accountId: nucc,
      amountCents: -12000,
      day: 15,
      startMonth: at(-3),
      recurrence: 'monthly',
      tags: ['casa'],
    }),
    base({
      kind: 'expense',
      description: 'Plano de saúde',
      categoryId: cat('Plano de saúde'),
      budgetGroup: 'essential',
      accountId: btgcc,
      amountCents: -39000,
      day: 8,
      startMonth: at(0),
      recurrence: 'monthly',
    }),
    base({
      kind: 'expense',
      description: 'Academia',
      categoryId: cat('Academia'),
      budgetGroup: 'comfort',
      accountId: nucc,
      amountCents: -13000,
      day: 12,
      startMonth: at(0),
      recurrence: 'monthly',
    }),
    base({
      kind: 'expense',
      description: 'Streaming',
      categoryId: cat('Apps de música e vídeo'),
      budgetGroup: 'comfort',
      accountId: nucc,
      amountCents: -13000,
      day: 12,
      startMonth: at(0),
      recurrence: 'monthly',
    }),
    base({
      kind: 'expense',
      description: 'Restaurantes',
      categoryId: cat('Restaurantes'),
      budgetGroup: 'guilt_free',
      accountId: btgcc,
      amountCents: -75000,
      day: 1,
      startMonth: at(0),
      recurrence: 'monthly',
    }),
    base({
      kind: 'expense',
      description: 'Curso de inglês',
      categoryId: cat('Cursos de idiomas'),
      budgetGroup: 'education',
      accountId: btgcc,
      amountCents: -38000,
      day: 10,
      startMonth: at(0),
      endMonth: at(11),
      recurrence: 'monthly',
    }),
    base({
      kind: 'expense',
      description: 'Fatura do cartão',
      categoryId: cat('Cartão de crédito'),
      budgetGroup: 'variable',
      accountId: btgcc,
      amountCents: -240000,
      day: 12,
      startMonth: at(0),
      recurrence: 'monthly',
    }),
    base({
      kind: 'expense',
      description: 'Aporte CDB',
      categoryId: cat('Renda fixa'),
      budgetGroup: 'investment',
      accountId: btgcc,
      amountCents: -220000,
      day: 21,
      startMonth: at(0),
      recurrence: 'monthly',
    }),
    base({
      kind: 'expense',
      description: 'Aporte FIIs',
      categoryId: cat('Renda variável'),
      budgetGroup: 'investment',
      accountId: btgcc,
      amountCents: -90000,
      day: 21,
      startMonth: at(0),
      recurrence: 'monthly',
    }),
    base({
      kind: 'income',
      description: 'Dividendos FIIs',
      categoryId: cat('Dividendos'),
      accountId: btgcc,
      amountCents: 26000,
      day: 15,
      startMonth: at(0),
      recurrence: 'monthly',
    }),
    base({
      kind: 'transfer',
      description: 'Transferência para o Nubank',
      accountId: btgcc,
      toAccountId: nucc,
      amountCents: -40000,
      day: 6,
      startMonth: at(0),
      recurrence: 'monthly',
    }),
    base({
      kind: 'expense',
      description: 'Combustível do carro',
      categoryId: cat('Combustível'),
      budgetGroup: 'essential',
      accountId: btgcc,
      amountCents: -35000,
      day: 25,
      startMonth: at(-3),
      recurrence: 'monthly',
      tags: ['carro'],
    }),
    base({
      kind: 'expense',
      description: 'IPVA do carro',
      categoryId: cat('IPVA e licenciamento'),
      budgetGroup: 'essential',
      accountId: btgcc,
      amountCents: -62000,
      day: 15,
      startMonth: at(1),
      recurrence: 'yearly',
      tags: ['carro'],
    }),
    base({
      kind: 'expense',
      description: 'Buffet do casamento',
      categoryId: cat('Outros gastos'),
      budgetGroup: 'comfort',
      accountId: btgcc,
      amountCents: -3000000,
      day: 15,
      startMonth: at(2),
      recurrence: 'installments',
      installments: 12,
      tags: ['casamento'],
    }),
  ]
  await db.insert(entries).values(rows)
  const split = (entryId: string) => [
    { ...owner, entryId, label: 'Adiantamento', bps: 4000, day: 20, nextMonth: false, sort: 0 },
    { ...owner, entryId, label: 'Saldo', bps: 6000, day: 5, nextMonth: true, sort: 1 },
  ]
  await db.insert(entryParts).values([...split(salaryNow), ...split(salaryNext)])
}
