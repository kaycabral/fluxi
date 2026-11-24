import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import PrivacidadePage, { metadata as privacyMetadata } from './privacidade/page'
import TermosPage, { metadata as termsMetadata } from './termos/page'

describe('privacy policy', () => {
  it('covers the data, the Google Limited Use statement, the rights and the contact', () => {
    render(<PrivacidadePage />)

    expect(privacyMetadata.title).toBe('Privacidade — Fluxi')
    expect(
      screen.getByRole('heading', { level: 1, name: 'Política de privacidade' }),
    ).toBeInTheDocument()
    for (const name of [
      'O que coletamos',
      'Dados obtidos do Google',
      'Compartilhamento',
      'Segurança',
      'Retenção',
      'Seus direitos (LGPD Art. 18)',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
    expect(screen.getByText(/requisitos de Uso Limitado/)).toBeInTheDocument()
    expect(
      screen.getByRole('link', {
        name: 'Política de Dados do Usuário dos Serviços de API do Google',
      }),
    ).toHaveAttribute('href', 'https://developers.google.com/terms/api-services-user-data-policy')
    expect(screen.getAllByRole('link', { name: 'privacidade@cbrl.dev' })[0]).toHaveAttribute(
      'href',
      'mailto:privacidade@cbrl.dev',
    )
    expect(screen.getAllByText(/24\/11\/2026/).length).toBeGreaterThan(0)
  })
})

describe('terms of use', () => {
  it('covers the as-is service, no financial advice, the governing law and the contact', () => {
    render(<TermosPage />)

    expect(termsMetadata.title).toBe('Termos de uso — Fluxi')
    expect(screen.getByRole('heading', { level: 1, name: 'Termos de uso' })).toBeInTheDocument()
    for (const name of [
      '3. Sem aconselhamento financeiro',
      '5. Serviço “como está”',
      '7. Encerramento',
      '9. Foro e legislação',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: 'política de privacidade' })).toHaveAttribute(
      'href',
      '/privacidade',
    )
    expect(screen.getByRole('link', { name: 'contato@cbrl.dev' })).toHaveAttribute(
      'href',
      'mailto:contato@cbrl.dev',
    )
    expect(screen.getByRole('link', { name: 'Termos' })).toHaveAttribute('href', '/termos')
  })
})
