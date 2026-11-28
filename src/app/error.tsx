'use client'

import { ErrorPage } from '@cbrl/next/pages'

// Safety net for any segment whose backend read is not wrapped in
// `readBackend` (e.g. painel pages after a valid session): render a recoverable
// screen inside the root layout instead of the default crash page. The error
// itself is logged on the server, where it happened.
export default function RouteError({
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <ErrorPage
      reset={unstable_retry}
      homeHref="/"
      homeLabel="Voltar ao início"
      description="Não conseguimos carregar esta página agora. Tenta de novo em alguns instantes."
    />
  )
}
