import { getServerUser } from '@/lib/auth/server'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'

/** A signed-in visitor of the landing goes on to the painel (renders nothing). */
export async function SignedInRedirect(): Promise<null> {
  await connection()
  if (await getServerUser()) redirect('/painel')
  return null
}
