'use client'

import {
  renameAccountAction,
  setAccountArchivedAction,
  type AccountsData,
  type ManagedAccount,
} from '@/features/ledger/adapters/actions/accounts'
import { formatMoney } from '@/features/ledger/core/format'
import { ACCOUNT_TYPE_LABELS } from '@/features/ledger/core/labels'
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  cn,
} from '@cbrl/design'
import { ChevronDown, Link2 } from 'lucide-react'
import { useState } from 'react'
import { focusOnMount, useAction } from './budget/shared'

/**
 * Configurações → Contas: the current space's accounts by bank, with today's
 * balance. Rename inline, archive (with what it means) and bring back from
 * "Arquivadas". A connected account (a bank feed is mapped to it) cannot be
 * archived until it is unmapped in Conexões.
 */
export function AccountsSettings({
  data,
  onChanged,
}: {
  data: AccountsData
  onChanged?: () => void
}) {
  const [pending, run] = useAction()
  const [archiving, setArchiving] = useState<ManagedAccount | null>(null)
  const active = data.accounts.filter((a) => !a.archived)
  const archived = data.accounts.filter((a) => a.archived)
  const bankName = (id: string) => data.banks.find((b) => b.id === id)?.name ?? 'Banco'
  const banks = data.banks.filter((b) => active.some((a) => a.bankId === b.id))

  const archive = (account: ManagedAccount, value: boolean) =>
    run(
      () => setAccountArchivedAction({ id: account.id, archived: value }),
      value ? 'Conta arquivada.' : 'Conta de volta às listas.',
      onChanged,
    )

  return (
    <div className="grid gap-6">
      {active.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhuma conta ativa neste espaço.</p>
      ) : (
        banks.map((bank) => (
          <section key={bank.id} aria-label={bank.name} className="grid gap-1">
            <h3 className="text-muted-foreground text-xs font-medium uppercase">{bank.name}</h3>
            <ul className="divide-y">
              {active
                .filter((a) => a.bankId === bank.id)
                .map((account) => (
                  <AccountRow
                    key={`${account.id}-${account.name}`}
                    account={account}
                    disabled={pending}
                    onRename={(name) =>
                      run(
                        () => renameAccountAction({ id: account.id, name }),
                        'Conta renomeada.',
                        onChanged,
                      )
                    }
                    onArchive={() => setArchiving(account)}
                  />
                ))}
            </ul>
          </section>
        ))
      )}

      {archived.length > 0 && (
        <Collapsible className="grid gap-2">
          <CollapsibleTrigger className="text-muted-foreground flex w-fit cursor-pointer items-center gap-1 text-sm [&[data-state=open]>svg]:rotate-180">
            Arquivadas ({archived.length})
            <ChevronDown className="size-4 transition-transform" aria-hidden />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul className="divide-y" aria-label="Contas arquivadas">
              {archived.map((account) => (
                <li key={account.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0 text-sm">
                    <p className="truncate">
                      {bankName(account.bankId)} · {account.name}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {ACCOUNT_TYPE_LABELS[account.type]} · fora dos saldos e totais
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => archive(account, false)}
                    aria-label={`Desarquivar ${account.name}`}
                  >
                    Desarquivar
                  </Button>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}

      {archiving !== null && (
        <AlertDialog open onOpenChange={(open) => !open && setArchiving(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Arquivar “{archiving.name}”?</AlertDialogTitle>
              <AlertDialogDescription>
                A conta e todas as transações dela deixam de contar em qualquer lugar: saldos,
                totais, orçamento, calendário e lista de transações. Nada é apagado: ao desarquivar,
                em “Arquivadas”, tudo volta como estava.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  archive(archiving, true)
                  setArchiving(null)
                }}
              >
                Arquivar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}

function AccountRow({
  account,
  disabled,
  onRename,
  onArchive,
}: {
  account: ManagedAccount
  disabled: boolean
  onRename: (name: string) => void
  onArchive: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(account.name)
  const save = () => {
    setEditing(false)
    const trimmed = name.trim()
    if (trimmed !== '' && trimmed !== account.name) onRename(trimmed)
    else setName(account.name)
  }
  return (
    <li className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1 text-sm">
        {editing ? (
          <Input
            aria-label={`Nome de ${account.name}`}
            value={name}
            ref={focusOnMount}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') {
                setName(account.name)
                setEditing(false)
              }
            }}
          />
        ) : (
          <p className="flex items-center gap-1 truncate">
            {account.name}
            {account.connected && (
              <Link2 className="text-muted-foreground size-3.5" aria-label="Vinculada ao banco" />
            )}
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          {ACCOUNT_TYPE_LABELS[account.type]} · saldo hoje{' '}
          <span className={cn(account.balanceCents < 0 && 'text-destructive')}>
            {formatMoney(account.balanceCents)}
          </span>
          {account.connected && (account.numberHints?.length ?? 0) > 0 && (
            <> · vinculada a {account.numberHints?.map((h) => `••${h}`).join(', ')}</>
          )}
        </p>
      </div>
      <div className="flex gap-1">
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => setEditing(true)}
          aria-label={`Renomear ${account.name}`}
        >
          Renomear
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={disabled || account.connected}
          title={account.connected ? 'Desvincule em Conexões antes de arquivar' : undefined}
          onClick={onArchive}
          aria-label={`Arquivar ${account.name}`}
        >
          Arquivar
        </Button>
      </div>
      {account.connected && (
        <p className="text-muted-foreground text-xs sm:hidden">
          Vinculada ao banco: desvincule em Conexões antes de arquivar.
        </p>
      )}
    </li>
  )
}
