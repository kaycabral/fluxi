'use client'

import { feedAccountLabel, institutionOf } from '@/features/bank-feed/core/institution'
import { compatibleTypes, ledgerBalanceOf } from '@/features/bank-feed/core/mapping'
import { BankLogo } from '@/features/bank-feed/ui/bank-logo'
import { formatMoney } from '@/features/ledger/core/format'
import { useAction } from '@/features/ledger/ui/budget/shared'
import {
  assignFeedItemAction,
  mapFeedAccountAction,
} from '@/features/spaces/adapters/actions/spaces'
import { switcherSpaces, type Space } from '@/features/spaces/core/space'
import { SpaceIcon } from '@/features/spaces/ui/space-icon'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@cbrl/design'
import { useState } from 'react'

/** A bank feed account under its connection (see `FeedAccountView`). */
export type FeedAccount = {
  id: string
  name: string
  type: string
  subtype: string
  balanceCents: number
  /** Last 4 digits of the bank account / card. */
  numberHint?: string | null
  accountId: string | null
  /** Who decided the mapping (`auto` / `manual`; null = nobody yet). */
  mappingSource?: 'auto' | 'manual' | null
  entryCount: number
  /** Bank transactions stored for it (none and a zero balance = "sem movimento"). */
  transactionCount: number
}

/** A fluxi account the mapping picker offers (see `MappableAccount`). */
export type MappableAccount = {
  id: string
  spaceId: string
  bankName: string
  name: string
  type: string
}

/** A bank connection as the settings list shows it (see `listFeedItems`). */
export type BankConnection = {
  itemId: string
  label: string | null
  spaceId: string | null
  accounts: string[]
  transactionCount: number
  feedAccounts: FeedAccount[]
}

const NOT_MAPPED = 'none'
const CREATE = 'create'

type MapTarget = { kind: 'account'; accountId: string } | { kind: 'create' } | { kind: 'none' }

function targetOf(value: string): MapTarget {
  if (value === NOT_MAPPED) return { kind: 'none' }
  if (value === CREATE) return { kind: 'create' }
  return { kind: 'account', accountId: value }
}

/** A remap/unmap waiting for confirmation: it deletes what the feed account created. */
type PendingMap = { feed: FeedAccount; label: string; target: MapTarget; targetName: string }

const FEED_TYPE_LABELS: Record<string, string> = { BANK: 'Conta', CREDIT: 'Cartão de crédito' }

const UNASSIGNED = 'none'

/** A move waiting for the user's confirmation. */
type PendingMove = { connection: BankConnection; name: string; space: Space }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Something happened on it (transactions or a balance): not noise. */
export function hasMovement(feed: Pick<FeedAccount, 'transactionCount' | 'balanceCents'>) {
  return feed.transactionCount > 0 || feed.balanceCents !== 0
}

/**
 * The name a connection shows: the institution derived from its accounts
 * (`institutionOf`), never the proxy connector's "MeuPluggy".
 */
export function connectionName(connection: BankConnection, index: number): string {
  if (connection.feedAccounts.length > 0) {
    return institutionOf(connection.feedAccounts.map((f) => f.name))
  }
  if (connection.accounts.length > 0) return institutionOf(connection.accounts)
  const label = connection.label?.trim() ?? ''
  if (label !== '' && !/pluggy/i.test(label)) return label
  return `Conexão ${index + 1}`
}

/**
 * "Conexões": one card per Open Finance connection: the institution, the
 * space its data goes to (unassigned = not synced) and its bank accounts with
 * the Fluxi account each one feeds ("→ Itaú · Conta"); accounts without any
 * movement are folded away. Accounts are linked automatically once the
 * connection has a space; "Trocar conta" is the manual override. Moving a
 * connection to another space takes everything already synced from it along,
 * so it asks first; pausing keeps the data where it is.
 */
export function BankConnections({
  connections,
  spaces,
  accounts = [],
  onChanged,
}: {
  connections: readonly BankConnection[]
  spaces: readonly Space[]
  /** Active fluxi accounts (every space) for "Conta no Fluxi". */
  accounts?: readonly MappableAccount[]
  /** After a successful change (the settings modal reloads its data). */
  onChanged?: () => void
}) {
  const [pending, run] = useAction()
  const [move, setMove] = useState<PendingMove | null>(null)
  const [remap, setRemap] = useState<PendingMap | null>(null)
  const map = (feed: FeedAccount, target: MapTarget) =>
    run(
      () => mapFeedAccountAction({ feedAccountId: feed.id, target }),
      target.kind === 'none' ? 'Conta desvinculada.' : 'Conta vinculada.',
      onChanged,
    )
  const chooseAccount = (feed: FeedAccount, label: string, value: string, targetName: string) => {
    const target = targetOf(value)
    if (feed.accountId !== null && feed.entryCount > 0) {
      setRemap({ feed, label, target, targetName })
    } else map(feed, target)
  }
  const options = switcherSpaces(spaces)
  const assign = (itemId: string, spaceId: string | null) =>
    run(
      () => assignFeedItemAction({ itemId, spaceId }),
      spaceId === null ? 'Conexão pausada.' : 'Espaço da conexão atualizado.',
      onChanged,
    )
  const choose = (connection: BankConnection, name: string, value: string) => {
    const space = options.find((s) => s.id === value)
    // "Sem espaço" (`UNASSIGNED`) matches no space: pause, keeping the data.
    if (space === undefined) return assign(connection.itemId, null)
    const hasData = connection.accounts.length > 0 || connection.transactionCount > 0
    if (hasData) setMove({ connection, name, space })
    else assign(connection.itemId, space.id)
  }

  return (
    <>
      {connections.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhuma conexão ainda.</p>
      ) : (
        <ul className="grid min-w-0 gap-3" aria-label="Conexões">
          {connections.map((c, index) => {
            const name = connectionName(c, index)
            return (
              <li key={c.itemId} className="min-w-0 rounded-lg border p-3 sm:p-4">
                <ConnectionCard
                  connection={c}
                  name={name}
                  spaces={options}
                  accounts={accounts}
                  disabled={pending}
                  onChooseSpace={(value) => choose(c, name, value)}
                  onChooseAccount={chooseAccount}
                />
              </li>
            )
          })}
        </ul>
      )}
      {remap !== null && (
        <RemapDialog
          pending={remap}
          onCancel={() => setRemap(null)}
          onConfirm={() => {
            map(remap.feed, remap.target)
            setRemap(null)
          }}
        />
      )}
      {move !== null && (
        <MoveDialog
          move={move}
          onCancel={() => setMove(null)}
          onConfirm={() => {
            assign(move.connection.itemId, move.space.id)
            setMove(null)
          }}
        />
      )}
    </>
  )
}

type ChooseAccount = (feed: FeedAccount, label: string, value: string, targetName: string) => void

/** A connection: header (institution + space) and its bank accounts. */
function ConnectionCard({
  connection: c,
  name,
  spaces,
  accounts,
  disabled,
  onChooseSpace,
  onChooseAccount,
}: {
  connection: BankConnection
  name: string
  spaces: readonly Space[]
  accounts: readonly MappableAccount[]
  disabled: boolean
  onChooseSpace: (value: string) => void
  onChooseAccount: ChooseAccount
}) {
  const [showQuiet, setShowQuiet] = useState(false)
  const active = c.feedAccounts.filter(hasMovement)
  const quiet = c.feedAccounts.filter((f) => !hasMovement(f))
  const row = (feed: FeedAccount) => (
    <FeedAccountRow
      key={feed.id}
      feed={feed}
      institution={name}
      linked={accounts.find((a) => a.id === feed.accountId) ?? null}
      accounts={accounts.filter(
        (a) => a.spaceId === c.spaceId && compatibleTypes(feed.type).some((t) => t === a.type),
      )}
      disabled={disabled}
      onChoose={onChooseAccount}
    />
  )
  let summary = 'Sem espaço: não sincroniza'
  if (c.spaceId !== null) {
    summary =
      c.feedAccounts.length === 0
        ? 'Nenhuma conta sincronizada ainda'
        : plural(active.length, 'conta com movimento', 'contas com movimento')
  }
  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        <BankLogo name={name} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{name}</p>
          <p className="text-muted-foreground truncate text-xs">{summary}</p>
        </div>
        <Select value={c.spaceId ?? UNASSIGNED} onValueChange={onChooseSpace} disabled={disabled}>
          <SelectTrigger
            size="sm"
            className="w-full max-w-full min-w-0 sm:w-auto sm:max-w-60"
            aria-label={`Espaço de ${name}`}
          >
            <span className="text-muted-foreground shrink-0">Espaço:</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED}>Sem espaço (não sincroniza)</SelectItem>
            {spaces.map((space) => (
              <SelectItem key={space.id} value={space.id}>
                <SpaceIcon icon={space.icon} />
                {space.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {c.spaceId !== null && active.length > 0 && (
        <ul className="grid min-w-0 gap-3 border-t pt-3" aria-label={`Contas de ${name}`}>
          {active.map(row)}
        </ul>
      )}
      {c.spaceId !== null && quiet.length > 0 && (
        <div className="grid min-w-0 gap-2">
          <Button
            type="button"
            variant="link"
            size="sm"
            className="text-muted-foreground h-auto justify-self-start p-0"
            aria-expanded={showQuiet}
            onClick={() => setShowQuiet((v) => !v)}
          >
            {showQuiet
              ? 'Esconder contas sem movimento'
              : `+${plural(quiet.length, 'conta sem movimento', 'contas sem movimento')}`}
          </Button>
          {showQuiet && (
            <ul className="grid min-w-0 gap-3" aria-label={`Contas sem movimento de ${name}`}>
              {quiet.map(row)}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

/** "Mover “Nubank” para Loja?": how many accounts and transactions go along. */
function MoveDialog({
  move,
  onCancel,
  onConfirm,
}: {
  move: PendingMove
  onCancel: () => void
  onConfirm: () => void
}) {
  const accounts = plural(move.connection.accounts.length, 'conta', 'contas')
  const transactions = plural(move.connection.transactionCount, 'transação', 'transações')
  return (
    <AlertDialog open onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Mover “{move.name}” para {move.space.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {accounts} e {transactions} vão para o espaço {move.space.name}. As contas movidas são
            vinculadas de novo no espaço {move.space.name}; as transações que vieram do banco passam
            para lá.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Mover</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * One bank account of a connection: its name, kind, bank balance and the
 * Fluxi account it feeds ("→ Itaú · Conta"); "Trocar conta" opens the picker.
 */
function FeedAccountRow({
  feed,
  institution,
  linked,
  accounts,
  disabled,
  onChoose,
}: {
  feed: FeedAccount
  institution: string
  linked: MappableAccount | null
  accounts: readonly MappableAccount[]
  disabled: boolean
  onChoose: ChooseAccount
}) {
  const [editing, setEditing] = useState(false)
  const label = feedAccountLabel(institution, feed)
  const nameOf = (value: string) => {
    if (value === NOT_MAPPED) return 'nenhuma conta'
    if (value === CREATE) return `uma conta nova “${label}”`
    return accounts.find((a) => a.id === value)?.name ?? 'outra conta'
  }
  let target = 'Não vinculada: não aparece no Fluxi'
  if (linked !== null) target = `→ ${linked.bankName} · ${linked.name}`
  else if (feed.accountId !== null) target = '→ conta arquivada'
  return (
    <li className="grid min-w-0 gap-1 text-sm">
      <p className="truncate font-medium" title={feed.name}>
        {label}
        {feed.numberHint ? (
          <span className="text-muted-foreground font-normal"> ••{feed.numberHint}</span>
        ) : null}
      </p>
      <p className="text-muted-foreground text-xs">
        {FEED_TYPE_LABELS[feed.type] ?? feed.type} · saldo no banco{' '}
        {formatMoney(ledgerBalanceOf(feed.type, feed.balanceCents))}
      </p>
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <span className="min-w-0 truncate">{target}</span>
        {!editing && (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={() => setEditing(true)}
            disabled={disabled}
            aria-label={`Trocar conta de ${label}`}
          >
            Trocar conta
          </Button>
        )}
      </div>
      {editing && (
        <Select
          value={feed.accountId ?? NOT_MAPPED}
          onValueChange={(value) => {
            setEditing(false)
            onChoose(feed, label, value, nameOf(value))
          }}
          disabled={disabled}
        >
          <SelectTrigger
            className="w-full max-w-full min-w-0 sm:w-72"
            aria-label={`Conta no Fluxi de ${label}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NOT_MAPPED}>Não vincular</SelectItem>
            {accounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.bankName} · {a.name}
              </SelectItem>
            ))}
            <SelectItem value={CREATE}>Criar conta</SelectItem>
          </SelectContent>
        </Select>
      )}
    </li>
  )
}

/** Changing or removing a mapping deletes the entries this bank account created. */
function RemapDialog({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: PendingMap
  onCancel: () => void
  onConfirm: () => void
}) {
  const entries = plural(pending.feed.entryCount, 'transação', 'transações')
  const unmap = pending.target.kind === 'none'
  return (
    <AlertDialog open onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {unmap
              ? `Desvincular “${pending.label}”?`
              : `Vincular “${pending.label}” a ${pending.targetName}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            As {entries} que vieram desta conta do banco serão apagadas
            {unmap ? '' : ' e criadas de novo na conta escolhida'}. O saldo inicial da conta
            anterior fica como está.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            {unmap ? 'Desvincular' : 'Vincular'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
