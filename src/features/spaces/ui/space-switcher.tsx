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
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
} from '@cbrl/design'
import { Archive, Briefcase, Check, ChevronDown, Plus, User } from 'lucide-react'
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

/** The current space, always in the header so the user never confuses where they are. */
export function SpaceBadge({ space }: { space: Space }) {
  return (
    <span
      className="flex min-w-0 items-center gap-1.5 text-sm font-medium"
      aria-label={`Espaço atual: ${space.name}`}
    >
      <SpaceIcon space={space} />
      <span className="truncate">{space.name}</span>
      {space.kind === 'business' && (
        <Badge variant="outline" className="border-amber-500/50 text-amber-700 dark:text-amber-300">
          {SPACE_KIND_LABELS.business}
        </Badge>
      )}
    </span>
  )
}

/**
 * "Pessoal ▾": switches between the user's spaces (each a separate ledger),
 * creates a new one and archives the current business space.
 */
export function SpaceSwitcher({ current, spaces }: { current: Space; spaces: readonly Space[] }) {
  const [creating, setCreating] = useState(false)
  const [archiving, setArchiving] = useState(false)
  const [pending, run] = useAction()
  const select = (space: Space) => {
    if (space.id !== current.id) run(() => switchSpaceAction(space.id))
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-between gap-2"
            disabled={pending}
            aria-label={`Espaço: ${current.name}. Trocar de espaço`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <SpaceIcon space={current} />
              <span className="truncate">{current.name}</span>
            </span>
            <ChevronDown aria-hidden className="size-4 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          <DropdownMenuLabel>Espaços</DropdownMenuLabel>
          {switcherSpaces(spaces).map((space) => (
            <DropdownMenuItem key={space.id} onSelect={() => select(space)}>
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
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreating(true)}>
            <Plus aria-hidden className="size-4" /> Novo espaço…
          </DropdownMenuItem>
          {current.kind === 'business' && (
            <DropdownMenuItem onSelect={() => setArchiving(true)}>
              <Archive aria-hidden className="size-4" /> Arquivar “{current.name}”…
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <NewSpaceDialog open={creating} onOpenChange={setCreating} />
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
    </>
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
              Um espaço é um controle separado, com contas, lançamentos e orçamento próprios. Nada
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
