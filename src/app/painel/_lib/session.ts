import 'server-only'

import { isoDayOf } from '@/features/ledger/core/format'
import { getServerScope, type ServerScope } from '@/features/spaces/adapters/scope'
import { redirect } from 'next/navigation'

/**
 * The scope of a painel page: the signed-in user and the active space (the
 * layout already redirects without a session; this narrows the type).
 */
export async function requirePainelScope(): Promise<ServerScope> {
  const scope = await getServerScope()
  if (!scope) redirect('/?login=1&next=%2Fpainel')
  return scope
}

/** Today in São Paulo as `YYYY-MM-DD`. */
export function todayIso(): string {
  return isoDayOf(new Date())
}
