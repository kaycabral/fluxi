'use client'

import { TabsList } from '@cbrl/design'
import { useRef, type ComponentProps } from 'react'
import { fadeMask } from './scroll-target'
import { useScrollStrip } from './use-scroll-strip'

/**
 * `TabsList` (line) that never hides the active tab: it scrolls sideways
 * without a scrollbar, fades only the edges that hide tabs, and brings the
 * activated tab fully into view (first to the start, last to the end, the
 * others centered).
 */
export function ScrollableTabsList({
  style,
  ...props
}: Omit<ComponentProps<typeof TabsList>, 'variant'>) {
  const ref = useRef<HTMLDivElement>(null)
  const edges = useScrollStrip(ref, '[role="tab"][data-state="active"]')
  return (
    <TabsList
      ref={ref}
      variant="line"
      data-fade-start={edges.start || undefined}
      data-fade-end={edges.end || undefined}
      style={{ ...style, maskImage: fadeMask(edges) }}
      {...props}
    />
  )
}
