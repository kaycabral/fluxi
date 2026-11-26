'use client'

import { useAction } from '@/features/ledger/ui/budget/shared'
import { assignFeedItemAction } from '@/features/spaces/adapters/actions/spaces'
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@cbrl/design'
import { Landmark } from 'lucide-react'
import { useState } from 'react'

/** A bank connection as the settings list shows it (see `listFeedItems`). */
export type BankConnection = {
  itemId: string
  label: string | null
  spaceId: string | null
  accounts: string[]
  transactionCount: number
}

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
}: {
  connections: readonly BankConnection[]
  spaces: readonly Space[]
}) {
  const [pending, run] = useAction()
  const [move, setMove] = useState<PendingMove | null>(null)
  const options = switcherSpaces(spaces)
  const assign = (itemId: string, spaceId: string | null) =>
    run(
      () => assignFeedItemAction({ itemId, spaceId }),
      spaceId === null ? 'Conexão pausada.' : 'Espaço da conexão atualizado.',
    )
  const choose = (connection: BankConnection, name: string, value: string) => {
    if (value === UNASSIGNED) return assign(connection.itemId, null)
    const space = options.find((s) => s.id === value)
    if (space === undefined) return
    const hasData = connection.accounts.length > 0 || connection.transactionCount > 0
    if (hasData) setMove({ connection, name, space })
    else assign(connection.itemId, space.id)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conexões</CardTitle>
        <CardDescription>
          Escolha em qual espaço entram os dados de cada conexão. Sem espaço, a conexão não é
          sincronizada. Ao trocar o espaço, todas as transações desta conexão vão junto para o novo
          espaço.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {connections.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhuma conexão ainda.</p>
        ) : (
          <ul className="divide-y" aria-label="Conexões">
            {connections.map((c, index) => {
              const name = c.label ?? `Conexão ${index + 1}`
              return (
                <li
                  key={c.itemId}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-start gap-2">
                    <Landmark aria-hidden className="text-muted-foreground mt-0.5 size-4" />
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
                    <SelectTrigger className="sm:w-56" aria-label={`Espaço de ${name}`}>
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
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
      <AlertDialog open={move !== null} onOpenChange={(open) => !open && setMove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Mover “{move?.name}” para {move?.space.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {move === null
                ? null
                : `${plural(move.connection.accounts.length, 'conta', 'contas')} e ${plural(
                    move.connection.transactionCount,
                    'transação',
                    'transações',
                  )} vão para o espaço ${move.space.name}. As contas movidas ficam sem vínculo com contas do Fluxi; seus lançamentos não mudam.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (move !== null) assign(move.connection.itemId, move.space.id)
                setMove(null)
              }}
            >
              Mover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
