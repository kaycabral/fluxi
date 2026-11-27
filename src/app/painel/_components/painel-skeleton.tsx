import {
  GenericContentSkeleton,
  PainelShellSkeleton,
} from '@/app/painel/_components/painel-shell-skeleton'
import { SIDEBAR_STATE_SCRIPT } from '@/app/painel/_components/sidebar-state'
import { CALENDAR_SKELETON_SCRIPT } from '@/features/ledger/ui/calendar/skeleton-state'
import { SHAPE_HINT_SCRIPT } from '@/features/ledger/ui/skeleton-shape-hint'

/**
 * Before the shell paints: the sidebar cookie onto `<html data-sidebar>` and
 * the remembered list sizes onto `<html data-skel-*>` (the static shell cannot
 * read the request; `<html>` already suppresses hydration warnings for
 * attributes set this way, as the theme does).
 */
function ShellStateScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: [SIDEBAR_STATE_SCRIPT, SHAPE_HINT_SCRIPT, CALENDAR_SKELETON_SCRIPT].join(';'),
      }}
    />
  )
}

/**
 * The painel while the session, the space and the sidebar load: the sidebar
 * as this browser left it and the skeleton of the screen being opened. The
 * static shell of every painel address.
 */
export function PainelSkeleton() {
  return (
    <>
      <ShellStateScript />
      <PainelShellSkeleton />
    </>
  )
}

/** A page's content while its data streams in, for the legacy screens. */
export function ContentSkeleton() {
  return <GenericContentSkeleton />
}
