// Sync the user's Open Finance data from Pluggy (Meu Pluggy connector) into
// the bank feed tables (repeatable).
//
//   pnpm pluggy:sync -- --email <user email> [--dry-run]
//
// Credentials and item ids come from env or ~/.config/fluxi/pluggy.env
// (PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET, PLUGGY_ITEM_IDS). Targets
// `POSTGRES_URL` when set, else the LOCAL Supabase stack. Items that are not
// UPDATED yet (still syncing, login error…) are reported and skipped. Prints
// aggregates only: never descriptions, single amounts or credentials.

import { fluxiDb } from '@/db'
import { syncFeedAccount } from '@/features/bank-feed/adapters/feed.write'
import { createPluggyClient, readPluggyConfig } from '@/features/bank-feed/adapters/pluggy.client'
import {
  itemReadiness,
  PLUGGY_SOURCE,
  toFeedAccount,
  toFeedTransaction,
} from '@/features/bank-feed/core/pluggy'
import { findUserIdByEmail } from '@/features/import/adapters/import.write'
import { readLocalSupabase } from '@cbrl/supabase/local'
import { parseArgs } from 'node:util'

const { values } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: { email: { type: 'string' }, 'dry-run': { type: 'boolean', default: false } },
})

const targetUrl = process.env.POSTGRES_URL || readLocalSupabase().dbUrl
process.env.POSTGRES_URL = targetUrl

async function main(): Promise<number> {
  const email = values.email
  if (!email) throw new Error('usage: pnpm pluggy:sync -- --email <user email> [--dry-run]')
  const dryRun = values['dry-run']
  const url = new URL(targetUrl)
  console.log(
    `alvo: ${url.hostname}:${url.port || '5432'}${url.pathname}${dryRun ? ' (dry-run)' : ''}`,
  )

  const db = fluxiDb.db()
  const userId = await findUserIdByEmail(db, email)
  if (userId === null) throw new Error('no user with that email in the target database')
  const config = await readPluggyConfig()
  const pluggy = await createPluggyClient(config)

  let skipped = 0
  for (const [index, itemId] of config.itemIds.entries()) {
    const item = await pluggy.getItem(itemId)
    const institution = item.connector?.name ?? 'Pluggy'
    const readiness = itemReadiness(item)
    const label = `item #${index + 1} (${institution})`
    if (!readiness.ready) {
      console.log(`${label}: pulado, status ${readiness.reason}`)
      skipped++
      continue
    }
    console.log(`${label}: atualizado em ${item.lastUpdatedAt ?? '?'}`)
    for (const account of await pluggy.listAccounts(itemId)) {
      const feed = toFeedAccount(account, institution)
      const rows = (await pluggy.listTransactions(account.id)).map(toFeedTransaction)
      const dates = rows.map((r) => r.date).sort()
      const span = dates.length > 0 ? `${dates[0]} → ${dates[dates.length - 1]}` : 'sem transações'
      const pending = rows.filter((r) => r.status === 'PENDING').length
      const head = `  ${feed.type}/${feed.subtype}: ${rows.length} transações (${pending} pendentes), ${span}`
      if (dryRun) {
        console.log(head)
        continue
      }
      const counts = await syncFeedAccount(db, userId, {
        source: PLUGGY_SOURCE,
        account: feed,
        transactions: rows,
      })
      console.log(`${head}; removidas ${counts.removed}`)
    }
  }
  return skipped > 0 ? 2 : 0
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((err: unknown) => {
    console.error('\nsync falhou:', err instanceof Error ? err.message : 'erro desconhecido')
    process.exitCode = 1
  })
  .finally(() => fluxiDb.close())
