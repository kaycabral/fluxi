'use client'

import { getSupabaseBrowserClient } from '@cbrl/supabase/client'
import { useRouter } from 'next/navigation'
import { useCallback } from 'react'

export function useSignOut() {
  const router = useRouter()
  return useCallback(async () => {
    await getSupabaseBrowserClient()?.auth.signOut()
    router.push('/')
    router.refresh()
  }, [router])
}
