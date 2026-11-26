'use client'

import { compatibleTypes, ledgerBalanceOf } from '@/features/bank-feed/core/mapping'
import { formatMoney } from '@/features/ledger/core/format'
import { useAction } from '@/features/ledger/ui/budget/shared'
import {
  assignFeedItemAction,
  mapFeedAccountAction,
} from '@/features/spaces/adapters/actions/spaces'
import { SPACE_KIND_LABELS, switcherSpaces, type Space } from '@/features/spaces/core/space'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@cbrl/design'
import { Landmark } from 'lucide-react'
import { useState } from 'react'

/** A bank feed account under its connection (see `FeedAccountView`). */
export type FeedAccount = {
  id: string
  name: string
  type: string
  subtype: string
  balanceCents: number
  accountId: string | null
  entryCount: number
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
type PendingMap = { feed: FeedAccount; target: MapTarget; targetName: string }

const FEED_TYPE_LABELS: Record<string, string> = { BANK: 'Conta', CREDIT: 'Cartão de crédito' }

const UNASSIGNED = 'none'

/** A move waiting for the user's confirmation. */
type PendingMove = { connection: BankConnection; name: string; space: Space }

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * "Conexões": every Open Finance connection of the user and the space its
 * data goes to. Unassigned connections are not synced. Moving a connection to
 * another space takes everything already synced from it along, so it asks
 * first (with how much moves); pausing keeps the data where it is.
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
  const chooseAccount = (feed: FeedAccount, value: string, targetName: string) => {
    const target = targetOf(value)
    if (feed.accountId !== null && feed.entryCount > 0) setRemap({ feed, target, targetName })
    else map(feed, target)
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
      <div>
        {connections.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhuma conexão ainda.</p>
        ) : (
          <ul className="divide-y" aria-label="Conexões">
            {connections.map((c, index) => {
              const name = c.label ?? `Conexão ${index + 1}`
              return (
                <li key={c.itemId} className="grid gap-3 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-2">
                      <Landmark
                        aria-hidden
                        className="text-muted-foreground mt-0.5 size-4 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="font-medium">{name}</p>
                        <p className="text-muted-foreground truncate text-sm">
                          {c.accounts.length > 0
                            ? c.accounts.join(', ')
                            : 'Nenhuma conta sincronizada'}
                        </p>
                      </div>
                    </div>
                    <Select
                      value={c.spaceId ?? UNASSIGNED}
                      onValueChange={(value) => choose(c, name, value)}
                      disabled={pending}
                    >
                      <SelectTrigger
                        className="sm:w-56 sm:shrink-0"
                        aria-label={`Espaço de ${name}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED}>Sem espaço (não sincroniza)</SelectItem>
                        {options.map((space) => (
                          <SelectItem key={space.id} value={space.id}>
                            {space.name}
                            {space.kind === 'business' ? ` · ${SPACE_KIND_LABELS.business}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {c.spaceId !== null && c.feedAccounts.length > 0 && (
                    <ul className="grid gap-2 pl-6" aria-label={`Contas de ${name}`}>
                      {c.feedAccounts.map((feed) => (
                        <FeedAccountRow
                          key={feed.id}
                          feed={feed}
                          accounts={accounts.filter(
                            (a) =>
                              a.spaceId === c.spaceId &&
                              compatibleTypes(feed.type).some((t) => t === a.type),
                          )}
                          disabled={pending}
                          onChoose={chooseAccount}
                        />
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
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
            {accounts} e {transactions} vão para o espaço {move.space.name}. As contas movidas ficam
            sem vínculo com contas do Fluxi; seus lançamentos não mudam.
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

/** One bank account of a connection: its last balance and "Conta no Fluxi". */
function FeedAccountRow({
  feed,
  accounts,
  disabled,
  onChoose,
}: {
  feed: FeedAccount
  accounts: readonly MappableAccount[]
  disabled: boolean
  onChoose: (feed: FeedAccount, value: string, targetName: string) => void
}) {
  const nameOf = (value: string) => {
    if (value === NOT_MAPPED) return 'nenhuma conta'
    if (value === CREATE) return `uma conta nova “${feed.name}”`
    return accounts.find((a) => a.id === value)?.name ?? 'outra conta'
  }
  return (
    <li className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 text-sm">
        <p className="truncate">{feed.name}</p>
        <p className="text-muted-foreground text-xs">
          {FEED_TYPE_LABELS[feed.type] ?? feed.type} · saldo no banco{' '}
          {formatMoney(ledgerBalanceOf(feed.type, feed.balanceCents))}
        </p>
      </div>
      <Select
        value={feed.accountId ?? NOT_MAPPED}
        onValueChange={(value) => onChoose(feed, value, nameOf(value))}
        disabled={disabled}
      >
        <SelectTrigger
          className="sm:w-56 sm:shrink-0"
          aria-label={`Conta no Fluxi de ${feed.name}`}
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
  const entries = plural(pending.feed.entryCount, 'lançamento', 'lançamentos')
  const unmap = pending.target.kind === 'none'
  return (
    <AlertDialog open onOpenChange={(open) => !open && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {unmap
              ? `Desvincular “${pending.feed.name}”?`
              : `Vincular “${pending.feed.name}” a ${pending.targetName}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Os {entries} que vieram desta conta do banco serão apagados
            {unmap ? '' : ' e criados de novo na conta escolhida'}. O saldo inicial da conta
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
