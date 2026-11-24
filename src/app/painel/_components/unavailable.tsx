'use client'

import { EmptyState } from '@cbrl/design'
import { useRouter } from 'next/navigation'

/** Degraded state when the backend read failed. */
export function Unavailable() {
  const router = useRouter()
  return (
    <EmptyState
      title="Não foi possível carregar seus dados"
      description="O servidor não respondeu a tempo. Tente de novo em instantes."
      action={{ label: 'Tentar de novo', onClick: () => router.refresh() }}
    />
  )
}
