import { getProfile } from '@/db'
import { createClient, type User } from '@supabase/supabase-js'

/** Admin (secret-key) client for the LOCAL stack. Env set by playwright.config / seed script. */
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export type AuthUserInput = { email: string; password: string; displayName: string }

/**
 * E2E runs on the dev database (it needs Supabase Auth), next to real data, so
 * it may only ever create/delete its OWN users: `e2e+<anything>@fluxi.local`.
 */
const E2E_EMAIL = /^e2e\+[a-z0-9-]+@fluxi\.local$/

export function isE2eEmail(email: string): boolean {
  return E2E_EMAIL.test(email)
}

async function findUser(email: string): Promise<User | undefined> {
  const admin = adminClient().auth.admin
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const found = data.users.find((u) => u.email === email)
    if (found !== undefined || data.users.length < 1000) return found
  }
}

async function createUser(input: AuthUserInput): Promise<string> {
  const { data, error } = await adminClient().auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.displayName },
  })
  if (error) throw error
  return data.user.id
}

/**
 * (Re)create an E2E password user in the LOCAL stack, so every run starts from
 * an empty ledger (the `on_auth_user_created` trigger creates its profile and
 * defaults). Refuses any email outside {@link isE2eEmail}: it never deletes a
 * real or dev user.
 */
export async function recreateE2eUser(input: AuthUserInput): Promise<string> {
  if (!isE2eEmail(input.email)) {
    throw new Error(`refusing to recreate a non-E2E user (${input.email})`)
  }
  const existing = await findUser(input.email)
  if (existing !== undefined) {
    const { error } = await adminClient().auth.admin.deleteUser(existing.id)
    if (error) throw error
  }
  return createUser(input)
}

/** The user with `input.email`, created when missing; an existing one is kept as is. */
export async function ensureAuthUser(
  input: AuthUserInput,
): Promise<{ id: string; created: boolean }> {
  const existing = await findUser(input.email)
  if (existing !== undefined) return { id: existing.id, created: false }
  return { id: await createUser(input), created: true }
}

export { getProfile }
