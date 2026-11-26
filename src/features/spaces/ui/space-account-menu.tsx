'use client'

import { useAction } from '@/features/ledger/ui/budget/shared'
import {
  archiveSpaceAction,
  createSpaceAction,
  switchSpaceAction,
  updateSpaceAction,
} from '@/features/spaces/adapters/actions/spaces'
import {
  DEFAULT_SPACE_ICON,
  SPACE_ICON_LABELS,
  SPACE_ICONS,
  switcherSpaces,
  type Space,
  type SpaceIconKey,
} from '@/features/spaces/core/space'
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
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  initials,
  Input,
  Label,
  SidebarMenuButton,
} from '@cbrl/design'
import { Archive, Check, ChevronsUpDown, Pencil, Plus } from 'lucide-react'
import { useState } from 'react'

/** Who is signed in, as the account menu shows it. */
export type MenuAccount = { name: string | null; email: string | null; avatarUrl: string | null }

/**
 * The one menu at the bottom of the sidebar (Oilio's user-menu placement, opening
 * upward): the trigger is the current space (its icon and name) over who is
 * signed in; the menu shows the account (avatar, name, e-mail), the user's
 * spaces (switch, "Novo espaço…", "Editar espaço…" for the current one and
 * archive it unless it is the personal one)
 * and then the account actions passed as `children` (settings, sign-out).
 * Without `spaces` (backend unavailable) only the account part is shown.
 */
export function SpaceAccountMenu({
  account,
  spaces,
  children,
}: {
  account: MenuAccount
  spaces: { current: Space; all: readonly Space[] } | null
  children: React.ReactNode
}) {
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [pending, run] = useAction()
  const current = spaces?.current ?? null
  const select = (space: Space) => {
    if (space.id !== current?.id) run(() => switchSpaceAction(space.id))
  }

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            size="lg"
            disabled={pending}
            aria-label={
              current === null
                ? 'Conta'
                : `Espaço: ${current.name}. Trocar de espaço e abrir a conta`
            }
            className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
          >
            {current === null ? (
              <AccountAvatar account={account} />
            ) : (
              <span className="bg-sidebar-accent flex size-8 shrink-0 items-center justify-center rounded-md">
                <SpaceIcon icon={current.icon} labelled />
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col text-left">
              <span className="truncate text-sm font-medium">{current?.name ?? 'Conta'}</span>
              <span className="text-muted-foreground truncate text-xs">
                {account.name ?? account.email ?? 'Fluxi'}
              </span>
            </span>
            <ChevronsUpDown aria-hidden className="text-muted-foreground ml-auto size-4" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-(--radix-dropdown-menu-trigger-width) min-w-64"
        >
          <DropdownMenuLabel className="flex items-center gap-2 font-normal">
            <AccountAvatar account={account} />
            <span className="flex min-w-0 flex-col gap-0.5">
              {account.name && <span className="truncate text-sm font-medium">{account.name}</span>}
              {account.email && (
                <span className="text-muted-foreground truncate text-xs">{account.email}</span>
              )}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {spaces !== null && current !== null && (
            <>
              <SpaceItems current={current} spaces={spaces.all} onSelect={select} />
              <DropdownMenuItem onSelect={() => setCreating(true)}>
                <Plus aria-hidden className="size-4" /> Novo espaço…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setEditing(true)}>
                <Pencil aria-hidden className="size-4" /> Editar espaço…
              </DropdownMenuItem>
              {current.kind !== 'personal' && (
                <DropdownMenuItem onSelect={() => setArchiving(true)}>
                  <Archive aria-hidden className="size-4" /> Arquivar “{current.name}”…
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
            </>
          )}
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
      <SpaceDialog open={creating} onOpenChange={setCreating} />
      {current !== null && (
        <SpaceDialog
          key={`${current.id}:${current.name}:${current.icon}`}
          space={current}
          open={editing}
          onOpenChange={setEditing}
        />
      )}
      {current !== null && (
        <AlertDialog open={archiving} onOpenChange={setArchiving}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Arquivar “{current.name}”?</AlertDialogTitle>
              <AlertDialogDescription>
                O espaço sai da lista e você volta para o Pessoal. Nada é apagado.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => run(() => archiveSpaceAction(current.id), 'Espaço arquivado.')}
              >
                Arquivar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}

function AccountAvatar({ account }: { account: MenuAccount }) {
  return (
    <Avatar size="default" className="rounded-md">
      {account.avatarUrl ? (
        <AvatarImage src={account.avatarUrl} alt={account.name ?? account.email ?? ''} />
      ) : null}
      <AvatarFallback className="rounded-md">
        {initials(account.name, account.email)}
      </AvatarFallback>
    </Avatar>
  )
}

function SpaceItems({
  current,
  spaces,
  onSelect,
}: {
  current: Space
  spaces: readonly Space[]
  onSelect: (space: Space) => void
}) {
  return (
    <DropdownMenuGroup aria-label="Espaços">
      <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
        Espaços
      </DropdownMenuLabel>
      {switcherSpaces(spaces).map((space) => (
        <DropdownMenuItem key={space.id} onSelect={() => onSelect(space)}>
          <SpaceIcon icon={space.icon} labelled />
          <span className="flex-1 truncate">{space.name}</span>
          {space.id === current.id && <Check aria-label="atual" className="size-4" />}
        </DropdownMenuItem>
      ))}
    </DropdownMenuGroup>
  )
}
/**
 * "Novo espaço…" (no `space`) or "Editar espaço…": a name chosen freely and an
 * icon. A space is a separate ledger (its own accounts, transactions and budget).
 */
function SpaceDialog({
  space,
  open,
  onOpenChange,
}: {
  space?: Space
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = useState(space?.name ?? '')
  const [icon, setIcon] = useState<SpaceIconKey>(space?.icon ?? DEFAULT_SPACE_ICON)
  const [pending, run] = useAction()
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (space === undefined) {
      run(
        () => createSpaceAction({ name, icon }),
        'Espaço criado.',
        () => {
          setName('')
          setIcon(DEFAULT_SPACE_ICON)
          onOpenChange(false)
        },
      )
      return
    }
    run(
      () => updateSpaceAction({ id: space.id, name, icon }),
      'Espaço atualizado.',
      () => onOpenChange(false),
    )
  }
  const fieldId = space === undefined ? 'space-name' : 'space-edit-name'
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{space === undefined ? 'Novo espaço' : 'Editar espaço'}</DialogTitle>
            <DialogDescription>
              {space === undefined
                ? 'Um espaço é um controle separado, com contas, transações e orçamento próprios. Nada dele se soma aos outros espaços.'
                : 'Mude o nome e o ícone. As contas, transações e o orçamento continuam os mesmos.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor={fieldId}>Nome</Label>
            <Input
              id={fieldId}
              value={name}
              maxLength={40}
              placeholder="Ex.: Casa, Loja, Freela"
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <fieldset className="grid gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">Ícone</legend>
            <div role="radiogroup" aria-label="Ícone" className="grid grid-cols-5 gap-2">
              {SPACE_ICONS.map((key) => (
                <Button
                  key={key}
                  type="button"
                  role="radio"
                  variant="outline"
                  size="icon"
                  aria-checked={icon === key}
                  aria-label={SPACE_ICON_LABELS[key]}
                  title={SPACE_ICON_LABELS[key]}
                  onClick={() => setIcon(key)}
                  className={cn(
                    'size-10 w-full',
                    icon === key && 'border-primary bg-primary/10 ring-primary/40 ring-2',
                  )}
                >
                  <SpaceIcon icon={key} className="size-5" />
                </Button>
              ))}
            </div>
          </fieldset>
          <DialogFooter>
            <Button type="submit" disabled={pending || name.trim() === ''}>
              {space === undefined ? 'Criar espaço' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
