import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BrandLink } from './brand-link'

let pathname = '/'
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}))

describe('BrandLink', () => {
  afterEach(() => {
    pathname = '/'
  })

  it('marks the current page and swallows the click there', () => {
    render(<BrandLink>Fluxi</BrandLink>)

    const link = screen.getByRole('link', { name: 'Fluxi' })
    expect(link).toHaveAttribute('aria-current', 'page')
    expect(fireEvent.click(link)).toBe(false)
  })

  it('navigates normally from another page', () => {
    pathname = '/painel/algo'
    render(<BrandLink href="/painel">Fluxi</BrandLink>)

    const link = screen.getByRole('link', { name: 'Fluxi' })
    expect(link).toHaveAttribute('href', '/painel')
    expect(link).not.toHaveAttribute('aria-current')
  })
})
