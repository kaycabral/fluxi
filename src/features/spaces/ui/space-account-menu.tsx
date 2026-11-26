'use client'

import { useAction } from '@/features/ledger/ui/budget/shared'
import {
  archiveSpaceAction,
  createSpaceAction,
  switchSpaceAction,
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
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
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
import { Archive, Briefcase, Check, ChevronsUpDown, Plus, User } from 'lucide-react'
import { useState } from 'react'

/** Icon of a space kind: a person for "Pessoal", a briefcase for "Empresa". */
export function SpaceIcon({ space, className }: { space: Space; className?: string }) {
  const Icon = space.kind === 'business' ? Briefcase : User
  return (
    <Icon
      aria-hidden
      className={cn(
        'size-4 shrink-0',
        space.kind === 'business'
          ? 'text-amber-600 dark:text-amber-400'
          : 'text-sky-600 dark:text-sky-400',
        className,
      )}
    />
  )
}

/** Who is signed in, as the account menu shows it. */
export type MenuAccount = { name: string | null; email: string | null; avatarUrl: string | null }

/**
 * The one menu at the bottom of the sidebar (Oilio's user-menu placement, opening
 * upward): the trigger is the current space (icon, name, "Empresa" badge) over
 * who is signed in; the menu shows the account (avatar, name, e-mail), the
 * user's spaces (switch, "Novo espaço…", archive the current business one)
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
                <SpaceIcon space={current} />
              </span>
            )}
            <span className="flex min-w-0 flex-1 flex-col text-left">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="truncate text-sm font-medium">{current?.name ?? 'Conta'}</span>
                {current?.kind === 'business' && (
                  <Badge
                    variant="outline"
                    className="border-amber-500/50 px-1.5 py-0 text-[10px] text-amber-700 dark:text-amber-300"
                  >
                    {SPACE_KIND_LABELS.business}
                  </Badge>
                )}
              </span>
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
              {current.kind === 'business' && (
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
      <NewSpaceDialog open={creating} onOpenChange={setCreating} />
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
          <SpaceIcon space={space} />
          <span className="flex-1 truncate">{space.name}</span>
          {space.kind === 'business' && (
            <Badge variant="outline" className="text-xs">
              {SPACE_KIND_LABELS.business}
            </Badge>
          )}
          {space.id === current.id && <Check aria-label="atual" className="size-4" />}
        </DropdownMenuItem>
      ))}
    </DropdownMenuGroup>
  )
}
/** "Novo espaço…": a separate ledger (its own accounts, entries and budget) for a company. */
function NewSpaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = useState('')
  const [pending, run] = useAction()
  const create = (event: React.FormEvent) => {
    event.preventDefault()
    run(
      () => createSpaceAction({ name, kind: 'business' }),
      'Espaço criado.',
      () => {
        setName('')
        onOpenChange(false)
      },
    )
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={create} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Novo espaço</DialogTitle>
            <DialogDescription>
              Um espaço é um controle separado, com contas, transações e orçamento próprios. Nada
              dele se soma ao Pessoal.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="space-name">Nome</Label>
            <Input
              id="space-name"
              value={name}
              maxLength={40}
              placeholder="Ex.: Minha empresa"
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-1.5">
            <span className="text-sm font-medium">Tipo</span>
            <span className="flex items-center gap-2 text-sm">
              <Briefcase aria-hidden className="size-4 text-amber-600 dark:text-amber-400" />
              {SPACE_KIND_LABELS.business}
            </span>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending || name.trim() === ''}>
              Criar espaço
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
