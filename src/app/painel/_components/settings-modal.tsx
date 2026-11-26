'use client'

import { fadeMask } from '@/components/scrollable-tabs/scroll-target'
import { useScrollStrip } from '@/components/scrollable-tabs/use-scroll-strip'
import { loadAccountsAction, type AccountsData } from '@/features/ledger/adapters/actions/accounts'
import { loadRulesAction } from '@/features/ledger/adapters/actions/categorize'
import type { CategorizationRule } from '@/features/ledger/core/similar'
import { AccountsSettings } from '@/features/ledger/ui/accounts-settings'
import { RulesSettings } from '@/features/ledger/ui/rules-settings'
import {
  loadConnectionsAction,
  type ConnectionsData,
} from '@/features/spaces/adapters/actions/spaces'
import { BankConnections } from '@/features/spaces/ui/bank-connections'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  ScrollArea,
  Skeleton,
} from '@cbrl/design'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The settings live in a modal over the painel (Oilio's pattern), addressed by
 * the URL fragment `#configuracoes/<section>`: the user menu sets it, closing
 * clears it, and `/painel/configuracoes` (or the old `/painel/conexoes`)
 * redirects to `/painel#configuracoes/conexoes`. The fragment never reaches
 * the server, so each section loads its data through a server action.
 */
export const SETTINGS_HASH_PREFIX = '#configuracoes/'

const SECTIONS = [
  {
    key: 'contas',
    label: 'Contas',
    description:
      'As contas deste espaço por banco, com o saldo de hoje. Renomeie ou arquive as que não usa mais.',
  },
  {
    key: 'conexoes',
    label: 'Conexões',
    description:
      'Escolha em qual espaço entram os dados de cada conexão; as contas do banco com movimento entram no Fluxi sozinhas. Sem espaço, a conexão não é sincronizada.',
  },
  {
    key: 'regras',
    label: 'Regras',
    description:
      'Transações novas do banco com essa descrição e valor na faixa ganham a categoria e o grupo sozinhos. Nunca mudam o que você já classificou.',
  },
] as const

type SectionKey = (typeof SECTIONS)[number]['key']

export const settingsHash = (section: SectionKey) => `${SETTINGS_HASH_PREFIX}${section}`

function sectionFromHash(hash: string): (typeof SECTIONS)[number] | null {
  if (!hash.startsWith(SETTINGS_HASH_PREFIX)) return null
  const key = hash.slice(SETTINGS_HASH_PREFIX.length)
  return SECTIONS.find((s) => s.key === key) ?? null
}

type Read<T> = { ok: true; data: T } | { ok: false; error: string }
type Loaded =
  | { key: 'conexoes'; read: Read<ConnectionsData> }
  | { key: 'contas'; read: Read<AccountsData> }
  | { key: 'regras'; read: Read<CategorizationRule[]> }

async function loadSection(key: SectionKey): Promise<Loaded> {
  if (key === 'contas') {
    const read = await loadAccountsAction().catch(() => ({
      ok: false as const,
      error: 'Não foi possível carregar as contas.',
    }))
    return { key, read }
  }
  if (key === 'regras') {
    const read = await loadRulesAction().catch(() => ({
      ok: false as const,
      error: 'Não foi possível carregar as regras.',
    }))
    return { key, read }
  }
  const read = await loadConnectionsAction().catch(() => ({
    ok: false as const,
    error: 'Não foi possível carregar as conexões.',
  }))
  return { key, read }
}

function Failed({ error, reload }: { error: string; reload: () => void }) {
  return (
    <div className="grid justify-items-start gap-2 text-sm">
      <p>{error}</p>
      <Button variant="outline" size="sm" onClick={reload}>
        Tentar de novo
      </Button>
    </div>
  )
}

function SectionBody({ loaded, reload }: { loaded: Loaded; reload: () => void }) {
  if (!loaded.read.ok) return <Failed error={loaded.read.error} reload={reload} />
  if (loaded.key === 'contas') {
    return <AccountsSettings data={loaded.read.data} onChanged={reload} />
  }
  if (loaded.key === 'regras') {
    return <RulesSettings rules={loaded.read.data} onChanged={reload} />
  }
  return <ConnectionsSection data={loaded.read.data} reload={reload} />
}

function ConnectionsSection({ data, reload }: { data: ConnectionsData; reload: () => void }) {
  return (
    <BankConnections
      connections={data.connections}
      spaces={data.spaces}
      accounts={data.accounts}
      onChanged={reload}
    />
  )
}

/**
 * The section list: a column beside the content from `sm`, a row above it on
 * phones, scrolling sideways (never hiding the current section; edges fade
 * where sections are hidden).
 */
function SettingsNav({
  current,
  onSelect,
}: {
  current: SectionKey
  onSelect: (key: SectionKey) => void
}) {
  const ref = useRef<HTMLElement>(null)
  const edges = useScrollStrip(ref, '[aria-current="page"]')
  return (
    <nav
      ref={ref}
      aria-label="Seções de configuração"
      style={{ maskImage: fadeMask(edges) }}
      className="bg-muted/40 flex [scrollbar-width:none] gap-0.5 overflow-x-auto border-b p-2 sm:flex-col sm:overflow-x-visible sm:border-r sm:border-b-0 [&::-webkit-scrollbar]:hidden"
    >
      {SECTIONS.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onSelect(item.key)}
          aria-current={item.key === current ? 'page' : undefined}
          className="text-muted-foreground hover:bg-background/60 aria-[current=page]:bg-background aria-[current=page]:text-foreground shrink-0 cursor-pointer rounded-md px-3 py-2 text-left text-sm font-normal whitespace-nowrap transition-colors aria-[current=page]:font-medium"
        >
          {item.label}
        </button>
      ))}
    </nav>
  )
}

export function SettingsModal() {
  const [section, setSection] = useState<(typeof SECTIONS)[number] | null>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const requestId = useRef(0)

  useEffect(() => {
    const sync = () => setSection(sectionFromHash(window.location.hash))
    sync()
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  const key = section?.key ?? null
  const load = useCallback(async () => {
    if (key === null) return
    const id = ++requestId.current
    const result = await loadSection(key)
    if (id === requestId.current) setLoaded(result)
  }, [key])

  useEffect(() => {
    requestId.current++
    setLoaded(null)
    if (key !== null) void load()
  }, [key, load])

  const select = (key: SectionKey) => {
    window.history.replaceState(null, '', settingsHash(key))
    setSection(sectionFromHash(settingsHash(key)))
  }

  // The dialog is only rendered open, so any change of it is a close.
  const close = () => {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
    setSection(null)
  }

  if (section === null) return null

  return (
    <Dialog open onOpenChange={close}>
      <DialogContent
        className="grid h-[min(85vh,40rem)] max-w-3xl grid-rows-[auto_1fr] gap-0 overflow-hidden p-0 sm:max-w-3xl sm:grid-cols-[12rem_minmax(0,1fr)] sm:grid-rows-1"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <SettingsNav current={section.key} onSelect={select} />

        <div className="flex min-h-0 min-w-0 flex-col">
          <DialogHeader className="gap-1 border-b p-6 pr-14">
            <DialogTitle>{section.label}</DialogTitle>
            <DialogDescription>{section.description}</DialogDescription>
          </DialogHeader>
          <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
            <div className="p-6">
              {loaded === null ? (
                <div className="flex flex-col gap-4" aria-label="Carregando">
                  <Skeleton className="h-4 w-full max-w-md" />
                  <Skeleton className="h-40 w-full" />
                </div>
              ) : (
                <SectionBody loaded={loaded} reload={() => void load()} />
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}
