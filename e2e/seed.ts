import { getProfile } from '@/db'
import { createClient } from '@supabase/supabase-js'

/** Admin (secret-key) client for the LOCAL stack. Env set by playwright.config / seed script. */
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export type AuthUserInput = { email: string; password: string; displayName: string }

/**
 * (Re)create a password user in the LOCAL stack. The `on_auth_user_created`
 * trigger creates its profile. Recreating keeps every run independent.
 */
export async function recreateAuthUser(input: AuthUserInput): Promise<string> {
  const admin = adminClient().auth.admin
  const { data: list, error: listError } = await admin.listUsers({ page: 1, perPage: 1000 })
  if (listError) throw listError
  const existing = list.users.find((u) => u.email === input.email)
  if (existing) {
    const { error } = await admin.deleteUser(existing.id)
    if (error) throw error
  }
  const { data, error } = await admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.displayName },
  })
  if (error) throw error
  return data.user.id
}

export { getProfile }
