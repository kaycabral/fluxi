'use client'

import { useGoogleSignIn } from '@/hooks/use-google-sign-in'
import { Button } from '@cbrl/design'

export function SignInButton() {
  const { signIn, loading } = useGoogleSignIn()
  return (
    <Button size="lg" onClick={() => void signIn()} disabled={loading}>
      {loading ? 'Conectando…' : 'Entrar com Google'}
    </Button>
  )
}
