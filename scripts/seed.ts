// Dev seed for the LOCAL Supabase stack: a user with a password login for
// manual testing (Google sign-in does not run locally). Recreates its own user
// on every run; never touches other users. Reads URL/keys/database from
// `supabase status`, so it can only ever target the local stack.

import { fluxiDb } from '@/db'
import { readLocalSupabase } from '@cbrl/supabase/local'

import { recreateAuthUser } from '@e2e/seed'

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
    await recreateAuthUser(USER)
    const line = '─'.repeat(64)
    console.log(`\n${line}`)
    console.log('✅ Seed concluído — Fluxi')
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
