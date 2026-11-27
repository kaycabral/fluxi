import { Skeleton } from '@cbrl/design'

/**
 * A page's content while its data streams in: the title, a row of cards and
 * a block. Part of the static shell, so a navigation shows it at once.
 */
export function ContentSkeleton() {
  return (
    <div className="grid gap-4 p-4 md:p-6" aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-80" />
    </div>
  )
}

/**
 * The painel while the session, the space and the sidebar load: the sidebar's
 * place and the content skeleton. The static shell of every painel address.
 */
export function PainelSkeleton() {
  return (
    <div className="flex h-dvh w-full">
      <div className="hidden w-56 shrink-0 flex-col gap-3 border-r p-3 md:flex">
        <Skeleton className="h-7 w-24" />
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-7" />
        ))}
        <Skeleton className="mt-auto h-12" />
      </div>
      <div className="min-w-0 flex-1">
        <ContentSkeleton />
      </div>
    </div>
  )
}
