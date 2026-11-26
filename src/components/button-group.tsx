import { cn } from '@cbrl/design'
import type { ComponentProps } from 'react'

// TODO(toolkit): replace with the `ButtonGroup` of `@cbrl/design` once it ships
// (kaycabral/toolkit); this mirrors shadcn's button-group so the swap is drop-in.

/** Joined buttons (shadcn "Button Group"): shared borders, outer corners only, focus on top. */
export function ButtonGroup({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      role="group"
      data-slot="button-group"
      data-orientation="horizontal"
      className={cn(
        'flex w-fit items-stretch',
        '[&>*]:focus-visible:relative [&>*]:focus-visible:z-10',
        '[&>*:not(:first-child)]:rounded-l-none [&>*:not(:last-child)]:rounded-r-none',
        '[&>*:not(:first-child)]:border-l-0',
        className,
      )}
      {...props}
    />
  )
}
