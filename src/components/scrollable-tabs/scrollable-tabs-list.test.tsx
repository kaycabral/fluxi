import { Tabs, TabsTrigger } from '@cbrl/design'
import { fireEvent, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ScrollableTabsList } from './scrollable-tabs-list'
import { useScrollStrip } from './use-scroll-strip'

function renderTabs() {
  render(
    <Tabs defaultValue="a">
      <ScrollableTabsList>
        {['a', 'b', 'c', 'd'].map((v) => (
          <TabsTrigger key={v} value={v}>
            Aba {v}
          </TabsTrigger>
        ))}
      </ScrollableTabsList>
    </Tabs>,
  )
  const list = screen.getByRole('tablist')
  // jsdom has no layout: a 250px strip over 400px of tabs.
  Object.defineProperty(list, 'clientWidth', { configurable: true, value: 250 })
  Object.defineProperty(list, 'scrollWidth', { configurable: true, value: 400 })
  const scrollTo = vi.fn((options: ScrollToOptions) => {
    list.scrollLeft = options.left ?? 0
    fireEvent.scroll(list)
  })
  Object.defineProperty(list, 'scrollTo', { configurable: true, value: scrollTo })
  return { list, scrollTo }
}

describe('ScrollableTabsList', () => {
  it('fades only the edges that hide tabs', () => {
    const { list } = renderTabs()
    expect(list).not.toHaveAttribute('data-fade-start')
    fireEvent.scroll(list)
    expect(list).toHaveAttribute('data-fade-end')
    expect(list).not.toHaveAttribute('data-fade-start')
    list.scrollLeft = 70
    fireEvent.scroll(list)
    expect(list).toHaveAttribute('data-fade-start')
    expect(list).toHaveAttribute('data-fade-end')
    list.scrollLeft = 150
    fireEvent.scroll(list)
    expect(list).toHaveAttribute('data-fade-start')
    expect(list).not.toHaveAttribute('data-fade-end')
  })

  it('scrolls the activated last tab to the end', async () => {
    const { list, scrollTo } = renderTabs()
    await userEvent.click(screen.getByRole('tab', { name: 'Aba d' }))
    expect(scrollTo).toHaveBeenLastCalledWith(expect.objectContaining({ left: 150 }))
    expect(list.scrollLeft).toBe(150)
  })

  it('scrolls without animation when the user prefers reduced motion', async () => {
    const media = vi.spyOn(window, 'matchMedia').mockReturnValue({
      ...window.matchMedia('(min-width: 0)'),
      matches: true,
    })
    const { scrollTo } = renderTabs()
    await userEvent.click(screen.getByRole('tab', { name: 'Aba d' }))
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 150, behavior: 'auto' })
    media.mockRestore()
  })

  it('reveals the active tab again when the strip resizes', () => {
    const callbacks: ResizeObserverCallback[] = []
    const Original = window.ResizeObserver
    window.ResizeObserver = class {
      constructor(callback: ResizeObserverCallback) {
        callbacks.push(callback)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    const { list } = renderTabs()
    list.scrollLeft = 150
    for (const callback of callbacks) callback([], new Original(() => {}))
    // The first tab is active: back to the start.
    expect(list.scrollLeft).toBe(0)
    window.ResizeObserver = Original
  })

  it('does nothing without a strip', () => {
    const { result } = renderHook(() => useScrollStrip({ current: null }, '[data-state]'))
    expect(result.current).toEqual({ start: false, end: false })
  })
})
