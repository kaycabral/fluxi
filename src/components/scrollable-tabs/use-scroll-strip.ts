'use client'

import { useEffect, useState, type RefObject } from 'react'
import { hiddenEdges, scrollTargetFor } from './scroll-target'

const reducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Keeps the active item of a horizontal strip (tabs, a nav row) in view (on
 * mount, on resize and whenever the active item changes, by click or
 * keyboard) and reports which edges hide content, for the fade masks.
 * `activeSelector` matches the active item among the strip's children.
 */
export function useScrollStrip(ref: RefObject<HTMLElement | null>, activeSelector: string) {
  const [edges, setEdges] = useState({ start: false, end: false })

  useEffect(() => {
    const strip = ref.current
    if (strip === null) return
    const updateEdges = () => {
      const next = hiddenEdges(strip.scrollLeft, strip.clientWidth, strip.scrollWidth)
      setEdges((prev) => (prev.start === next.start && prev.end === next.end ? prev : next))
    }
    const reveal = (smooth: boolean) => {
      const active = strip.querySelector<HTMLElement>(activeSelector)
      if (active !== null && strip.scrollWidth > strip.clientWidth) {
        const items = Array.from(strip.children)
        const left = scrollTargetFor({
          viewport: strip.clientWidth,
          content: strip.scrollWidth,
          itemStart:
            active.getBoundingClientRect().left -
            strip.getBoundingClientRect().left +
            strip.scrollLeft,
          itemWidth: active.getBoundingClientRect().width,
          index: items.indexOf(active),
          count: items.length,
        })
        if (Math.abs(left - strip.scrollLeft) > 1) {
          strip.scrollTo({ left, behavior: smooth && !reducedMotion() ? 'smooth' : 'auto' })
        }
      }
      updateEdges()
    }

    reveal(false)
    strip.addEventListener('scroll', updateEdges, { passive: true })
    const resize = new ResizeObserver(() => reveal(false))
    resize.observe(strip)
    const mutations = new MutationObserver(() => reveal(true))
    mutations.observe(strip, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state', 'aria-current'],
    })
    return () => {
      strip.removeEventListener('scroll', updateEdges)
      resize.disconnect()
      mutations.disconnect()
    }
  }, [ref, activeSelector])

  return edges
}
