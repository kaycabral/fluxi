'use client'

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
import { Button, SettingsDialog, Skeleton, useHashSection } from '@cbrl/design'
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * The settings live in a modal over the painel (`SettingsDialog`), addressed by
 * the URL fragment `#configuracoes/<section>` (`useHashSection`): the user menu
 * sets it, closing clears it, and `/painel/configuracoes` (or the old `/painel/conexoes`)
 * redirects to `/painel#configuracoes/conexoes`. The fragment never reaches
 * the server, so each section loads its data through a server action.
 */
const SETTINGS_HASH = 'configuracoes'

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

const SECTION_KEYS: readonly SectionKey[] = SECTIONS.map((s) => s.key)

export const settingsHash = (section: SectionKey) => `#${SETTINGS_HASH}/${section}`

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
 * A fragment navigation the router did not make (address bar, `location.hash`,
 * a same-page `goto`) leaves Next's committed URL without the hash, and its
 * next history write strips it, closing the modal. Re-writing the URL through
 * the (Next-patched) `replaceState` makes the router adopt the hash.
 */
function useAdoptExternalHash() {
  useEffect(() => {
    const adopt = () => {
      if (window.location.hash.startsWith(`#${SETTINGS_HASH}/`)) {
        window.history.replaceState(window.history.state, '', window.location.href)
      }
    }
    window.addEventListener('hashchange', adopt)
    return () => window.removeEventListener('hashchange', adopt)
  }, [])
}

export function SettingsModal() {
  useAdoptExternalHash()
  const { section: key, open, close } = useHashSection(SETTINGS_HASH, SECTION_KEYS)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const requestId = useRef(0)

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

  if (key === null) return null

  return (
    <SettingsDialog
      open
      // The dialog is only rendered open, so any change of it is a close.
      onOpenChange={close}
      sections={SECTIONS}
      value={key}
      onValueChange={open}
      navLabel="Seções de configuração"
    >
      {loaded === null ? (
        <div className="flex flex-col gap-4" aria-label="Carregando">
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <SectionBody loaded={loaded} reload={() => void load()} />
      )}
    </SettingsDialog>
  )
}
