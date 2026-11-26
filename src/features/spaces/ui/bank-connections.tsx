'use client'

import { useAction } from '@/features/ledger/ui/budget/shared'
import { assignFeedItemAction } from '@/features/spaces/adapters/actions/spaces'
import { SPACE_KIND_LABELS, switcherSpaces, type Space } from '@/features/spaces/core/space'
import {
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

/** A bank connection as the settings list shows it (see `listFeedItems`). */
export type BankConnection = {
  itemId: string
  label: string | null
  spaceId: string | null
  accounts: string[]
}

const UNASSIGNED = 'none'

/**
 * "Conexões bancárias": every Open Finance connection of the user and the
 * space its data goes to. Unassigned connections are not synced; changing the
 * space only routes future syncs (nothing already synced moves).
 */
export function BankConnections({
  connections,
  spaces,
}: {
  connections: readonly BankConnection[]
  spaces: readonly Space[]
}) {
  const [pending, run] = useAction()
  const options = switcherSpaces(spaces)
  const assign = (itemId: string, value: string) =>
    run(
      () => assignFeedItemAction({ itemId, spaceId: value === UNASSIGNED ? null : value }),
      value === UNASSIGNED ? 'Conexão pausada.' : 'Espaço da conexão atualizado.',
    )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conexões bancárias</CardTitle>
        <CardDescription>
          Escolha em qual espaço entram os dados de cada conexão. Sem espaço, a conexão não é
          sincronizada. Trocar o espaço vale para as próximas sincronizações; nada do que já foi
          sincronizado muda de lugar.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {connections.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhuma conexão bancária ainda.</p>
        ) : (
          <ul className="divide-y" aria-label="Conexões bancárias">
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
                    onValueChange={(value) => assign(c.itemId, value)}
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
    </Card>
  )
}
