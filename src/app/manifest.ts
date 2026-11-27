import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Fluxi',
    short_name: 'Fluxi',
    description: 'Planeje o fluxo de caixa das suas finanças pessoais.',
    start_url: '/painel',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#0B5D4B',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
