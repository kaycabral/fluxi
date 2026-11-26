'use client'

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
    key: 'conexoes',
    label: 'Conexões',
    description:
      'Escolha em qual espaço entram os dados de cada conexão. Sem espaço, a conexão não é sincronizada. Ao trocar o espaço, todas as transações desta conexão vão junto para o novo espaço.',
  },
] as const

type SectionKey = (typeof SECTIONS)[number]['key']

export const settingsHash = (section: SectionKey) => `${SETTINGS_HASH_PREFIX}${section}`

function sectionFromHash(hash: string): (typeof SECTIONS)[number] | null {
  if (!hash.startsWith(SETTINGS_HASH_PREFIX)) return null
  const key = hash.slice(SETTINGS_HASH_PREFIX.length)
  return SECTIONS.find((s) => s.key === key) ?? null
}

type Loaded = { ok: true; data: ConnectionsData } | { ok: false; error: string }

function ConnectionsSection({ loaded, reload }: { loaded: Loaded; reload: () => void }) {
  if (!loaded.ok) {
    return (
      <div className="grid justify-items-start gap-2 text-sm">
        <p>{loaded.error}</p>
        <Button variant="outline" size="sm" onClick={reload}>
          Tentar de novo
        </Button>
      </div>
    )
  }
  return (
    <BankConnections
      connections={loaded.data.connections}
      spaces={loaded.data.spaces}
      accounts={loaded.data.accounts}
      onChanged={reload}
    />
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

  const load = useCallback(async () => {
    const id = ++requestId.current
    const result: Loaded = await loadConnectionsAction().catch(() => ({
      ok: false as const,
      error: 'Não foi possível carregar as conexões.',
    }))
    if (id === requestId.current) setLoaded(result)
  }, [])

  useEffect(() => {
    if (section === null) {
      requestId.current++
      setLoaded(null)
      return
    }
    void load()
  }, [section, load])

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
        <nav
          aria-label="Seções de configuração"
          className="bg-muted/40 flex gap-0.5 border-b p-2 sm:flex-col sm:border-r sm:border-b-0"
        >
          {SECTIONS.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => select(item.key)}
              aria-current={item.key === section.key ? 'page' : undefined}
              className="text-muted-foreground hover:bg-background/60 aria-[current=page]:bg-background aria-[current=page]:text-foreground cursor-pointer rounded-md px-3 py-2 text-left text-sm font-normal transition-colors aria-[current=page]:font-medium"
            >
              {item.label}
            </button>
          ))}
        </nav>

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
                <ConnectionsSection loaded={loaded} reload={() => void load()} />
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  )
}
