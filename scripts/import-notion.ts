// Import the user's Notion finance workspace into Fluxi (repeatable, lossless).
//
//   pnpm import:notion -- --email <user email> [--dry-run] [--from-dump <dir>]
//
// Targets `POSTGRES_URL` when set (production, later), else the LOCAL Supabase
// stack. Reads Notion with NOTION_TOKEN (env or ~/.config/fluxi/notion.env), or
// a local raw dump with --from-dump. A real run replaces, in one transaction,
// everything a previous Notion import created for that user. Prints aggregates
// only: never descriptions, single amounts or the token. Exits non-zero when
// the re-expanded ledger diverges from Notion.

import { fluxiDb, personalScope } from '@/db'
import { readImportedLedger } from '@/features/import/adapters/import.read'
import {
  categoryIdsByKey,
  findUserIdByEmail,
  writeImport,
} from '@/features/import/adapters/import.write'
import {
  fetchNotionSource,
  readNotionDump,
  readNotionToken,
} from '@/features/import/adapters/notion.client'
import {
  buildImportPlan,
  expectedFlows,
  verifyPlan,
  type ImportPlan,
} from '@/features/import/core/plan'
import { formatReport } from '@/features/import/core/report'
import { verifyLedger, type Verification } from '@/features/import/core/verify'
import { readLocalSupabase } from '@cbrl/supabase/local'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    email: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    'from-dump': { type: 'string' },
  },
})

const targetUrl = process.env.POSTGRES_URL || readLocalSupabase().dbUrl
process.env.POSTGRES_URL = targetUrl

function describeTarget(raw: string): string {
  const url = new URL(raw)
  return `${url.hostname}:${url.port || '5432'}${url.pathname}`
}

function accountLabeler(plan: ImportPlan, externalOf: (id: string) => string) {
  const index = new Map(plan.accounts.map((a, i) => [a.externalId, `#${i + 1} ${a.type}`]))
  return (id: string) => index.get(externalOf(id)) ?? '(desconhecida)'
}

function print(
  plan: ImportPlan,
  verification: Verification,
  ctx: { toCreate: number; label: (id: string) => string },
) {
  const lines = formatReport({
    stats: plan.stats,
    counts: {
      banks: plan.banks.length,
      accounts: plan.accounts.length,
      archivedAccounts: plan.accounts.filter((a) => a.archived).length,
      payments: plan.payments.length,
    },
    categories: { toCreate: ctx.toCreate, reused: plan.categories.length - ctx.toCreate },
    verification,
    accountLabel: ctx.label,
  })
  console.log(lines.join('\n'))
}

async function main(): Promise<number> {
  const email = values.email
  if (!email) throw new Error('usage: pnpm import:notion -- --email <user email> [--dry-run]')
  const db = fluxiDb.db()
  console.log(`alvo: ${describeTarget(targetUrl)}${values['dry-run'] ? ' (dry-run)' : ''}`)
  const userId = await findUserIdByEmail(db, email)
  if (userId === null) throw new Error('no user with that email in the target database')
  // The import always goes into the user's personal space.
  const scope = await personalScope(db, userId)

  const dump = values['from-dump']
  const source = dump
    ? await readNotionDump(dump)
    : await fetchNotionSource(await readNotionToken())
  const plan = buildImportPlan(source)
  const planCheck = verifyPlan(plan)
  const existing = await categoryIdsByKey(db, scope)
  const toCreate = plan.categories.filter((c) => !existing.has(c.key)).length

  if (values['dry-run'] || planCheck.divergences > 0) {
    print(plan, planCheck, { toCreate, label: accountLabeler(plan, (id) => id) })
    if (planCheck.divergences > 0) console.error('\nplano diverge do Notion: nada foi gravado')
    return planCheck.divergences > 0 ? 1 : 0
  }

  const summary = await writeImport(db, scope, { plan, source })
  const written = await readImportedLedger(db, scope)
  const originals = expectedFlows(plan).map((f) => ({
    ...f,
    accountId: written.accountIds.get(f.accountId) ?? f.accountId,
  }))
  const externalOf = new Map([...written.accountIds].map(([external, id]) => [id, external]))
  const dbCheck = verifyLedger(originals, written)
  print(plan, dbCheck, {
    toCreate: summary.categories.created,
    label: accountLabeler(plan, (id) => externalOf.get(id) ?? id),
  })
  console.log(
    `\nGravado: removidos da importação anterior ${summary.removed.entries} lançamentos, ` +
      `${summary.removed.accounts} contas, ${summary.removed.banks} bancos, ${summary.removed.categories} categorias; ` +
      `inseridos ${summary.entries} lançamentos, ${summary.overrides} exceções, ${summary.payments} pagamentos, ` +
      `${summary.links} vínculos, ${summary.raw} registros brutos ` +
      `(bancos ${summary.banks.created} novos/${summary.banks.kept} mantidos, contas ${summary.accounts.created}/${summary.accounts.kept}).`,
  )
  return dbCheck.divergences > 0 ? 1 : 0
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((err: unknown) => {
    console.error('\nimportação falhou:', err instanceof Error ? err.message : 'erro desconhecido')
    process.exitCode = 1
  })
  .finally(() => fluxiDb.close())
