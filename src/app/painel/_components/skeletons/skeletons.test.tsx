import { PainelShellSkeleton, RouteSkeleton } from '@/app/painel/_components/painel-shell-skeleton'
import { LedgerShell } from '@/features/ledger/ui/ledger-shell'
import { sampleRefs } from '@/features/ledger/ui/test-fixtures'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const pathname = vi.hoisted(() => ({ current: '/painel' }))
vi.mock('next/navigation', () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/features/ledger/adapters/actions/categorize', () => ({
  findSimilarAction: vi.fn(),
  categorizeEntriesAction: vi.fn(),
  loadRulesAction: vi.fn(),
  deleteRuleAction: vi.fn(),
}))
vi.mock('@/features/ledger/adapters/actions/undo', () => ({
  undoAction: vi.fn(),
  forgetUndoAction: vi.fn(),
}))
vi.mock('@/features/ledger/adapters/actions/entries', () => ({
  createEntryAction: vi.fn(),
  updateEntryAction: vi.fn(),
  deleteEntryAction: vi.fn(),
  changeDayAction: vi.fn(),
}))

const ROUTES = [
  '/painel',
  '/painel/calendario',
  '/painel/transacoes',
  '/painel/orcamento',
  '/painel/objetivos',
  '/painel/linha-do-tempo',
]

/**
 * The drawn skeleton is hidden from screen readers (aria-hidden root): its
 * buttons and nav exist (drawn) but none reaches the accessibility tree, and
 * its labels are CSS-only, so only one "Carregando…" status is announced and
 * nothing duplicates the page that replaces it.
 */
function expectInert() {
  expect(screen.getByRole('status')).toHaveTextContent('Carregando…')
  for (const role of ['heading', 'link', 'button', 'navigation', 'table'] as const) {
    expect(screen.queryAllByRole(role)).toHaveLength(0)
  }
}

afterEach(() => {
  pathname.current = '/painel'
})

describe('route skeletons', () => {
  it.each(ROUTES)('%s before the session: hinted rows, nothing real', (route) => {
    render(<RouteSkeleton pathname={route} />)
    expectInert()
  })

  it.each(ROUTES)('%s with the space refs: the real budget groups, still inert', (route) => {
    render(
      <LedgerShell refs={sampleRefs()}>
        <RouteSkeleton pathname={route} />
      </LedgerShell>,
    )
    expectInert()
    // Group names are CSS-only: never text a test (or a screen reader) finds.
    const name = sampleRefs().budgetGroups[0]?.name ?? ''
    expect(screen.queryByText(name)).toBeNull()
  })
})

describe('painel shell skeleton', () => {
  it.each(ROUTES)('draws the sidebar both ways around %s', (route) => {
    pathname.current = route
    render(<PainelShellSkeleton />)
    expectInert()
    // Expanded and collapsed sidebars are both drawn: CSS keeps the one
    // <html data-sidebar> names, so each page item appears twice.
    expect(screen.getAllByRole('listitem', { hidden: true }).length).toBeGreaterThanOrEqual(10)
    expect(screen.getAllByRole('button', { hidden: true }).length).toBeGreaterThan(0)
  })
})
