// Dev seed for the LOCAL Supabase stack: a user with a password login for
// manual testing (Google sign-in does not run locally) and a demo ledger.
// Idempotent and non-destructive: creates the dev user only when missing and
// seeds the demo ledger only while that user has no banks; never deletes or
// rewrites anything, and never touches other users (the dev database holds real
// data). Reads URL/keys/database from `supabase status`, so it can only ever
// target the local stack.

import { fluxiDb, fluxiSchema, personalScope } from '@/db'
import { seedDemoLedger } from '@/db/demo-ledger'
import { monthOf } from '@/features/ledger/core/format'
import { readLocalSupabase } from '@cbrl/supabase/local'

import { ensureAuthUser } from '@e2e/seed'
import { eq } from 'drizzle-orm'

const local = readLocalSupabase()
Object.assign(process.env, {
  NEXT_PUBLIC_SUPABASE_URL: local.apiUrl,
  SUPABASE_SECRET_KEY: local.secretKey,
  POSTGRES_URL: local.dbUrl,
})

const USER = {
  email: 'dev@fluxi.local',
  password: 'fluxi-dev-password',
  displayName: 'Usuário Dev',
}
const PORT = 3004

async function main(): Promise<void> {
  try {
    const { id: userId, created } = await ensureAuthUser(USER)
    const db = fluxiDb.db()
    const banks = await db
      .select({ id: fluxiSchema.banks.id })
      .from(fluxiSchema.banks)
      .where(eq(fluxiSchema.banks.userId, userId))
      .limit(1)
    const scope = await personalScope(db, userId)
    // Demo data shaped like the prototype, counting from the current month.
    const seeded = banks.length === 0
    if (seeded) await seedDemoLedger(db, scope, monthOf(new Date()))
    const line = '─'.repeat(64)
    console.log(`\n${line}`)
    console.log(
      `✅ Seed concluído — Fluxi (usuário ${created ? 'criado' : 'mantido'}; ${seeded ? 'dados de exemplo criados' : 'dados existentes mantidos'})`,
    )
    console.log(line)
    console.log(`  Painel:       http://localhost:${PORT}/painel`)
    console.log('  Login local (Google não roda sem OAuth client): com ENABLE_TEST_AUTH=true')
    console.log(`  no .env.local, rode no console do navegador em localhost:${PORT}:`)
    console.log(
      `    await fetch('/api/e2e-signin', { method: 'POST', body: JSON.stringify({ email: '${USER.email}', password: '${USER.password}' }) })`,
    )
    console.log(`  Studio:       ${local.apiUrl.replace('54421', '54423')}`)
    console.log(`${line}\n`)
  } catch (err) {
    console.error('\n❌ Seed falhou:', err)
    console.error('\nO stack local está rodando? Suba com `pnpm db:start` antes.\n')
    process.exitCode = 1
  } finally {
    await fluxiDb.close()
  }
}

void main()
