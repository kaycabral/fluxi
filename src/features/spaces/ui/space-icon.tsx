'use client'

import { SPACE_ICON_LABELS, type SpaceIconKey } from '@/features/spaces/core/space'
import { cn } from '@cbrl/design'
import {
  Briefcase,
  Building2,
  GraduationCap,
  Heart,
  House,
  Laptop,
  PiggyBank,
  Plane,
  Store,
  User,
  type LucideIcon,
} from 'lucide-react'

export const SPACE_ICON_COMPONENTS: Record<SpaceIconKey, LucideIcon> = {
  user: User,
  house: House,
  briefcase: Briefcase,
  store: Store,
  'building-2': Building2,
  laptop: Laptop,
  heart: Heart,
  'graduation-cap': GraduationCap,
  plane: Plane,
  'piggy-bank': PiggyBank,
}

/** The icon a space wears (chosen in "Novo espaço…" / "Editar espaço…"). */
export function SpaceIcon({
  icon,
  labelled = false,
  className,
}: {
  icon: SpaceIconKey
  /** Name the icon ("Ícone: Loja") instead of hiding it from assistive tech. */
  labelled?: boolean
  className?: string
}) {
  const Icon = SPACE_ICON_COMPONENTS[icon]
  const a11y = labelled
    ? { role: 'img', 'aria-label': `Ícone: ${SPACE_ICON_LABELS[icon]}` }
    : { 'aria-hidden': true }
  return (
    <Icon {...a11y} className={cn('size-4 shrink-0 text-sky-600 dark:text-sky-400', className)} />
  )
}
