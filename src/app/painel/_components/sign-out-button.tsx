'use client'

import { useSignOut } from '@/hooks/use-sign-out'
import { Button } from '@cbrl/design'
import { LogOut } from 'lucide-react'

export function SignOutButton() {
  const signOut = useSignOut()
  return (
    <Button variant="ghost" size="sm" className="gap-2" onClick={() => void signOut()}>
      <LogOut className="size-4" />
      Sair
    </Button>
  )
}
