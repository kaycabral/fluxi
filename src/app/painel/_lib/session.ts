import 'server-only'

import { isoDayOf } from '@/features/ledger/core/format'
import { getServerUser } from '@/lib/auth/server'
import type { SessionUser } from '@cbrl/supabase'
import { redirect } from 'next/navigation'

/** The signed-in user of a painel page (the layout already redirects; this narrows the type). */
export async function requirePainelUser(): Promise<SessionUser> {
  const user = await getServerUser()
  if (!user) redirect('/?login=1&next=%2Fpainel')
  return user
}

/** Today in São Paulo as `YYYY-MM-DD`. */
export function todayIso(): string {
  return isoDayOf(new Date())
}
