import { AutoSignIn } from '@/components/auto-sign-in'
import { WebAnalytics } from '@/components/web-analytics'
import { ThemeProvider, Toaster } from '@cbrl/design'
import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'swap',
})

const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL

export const metadata: Metadata = {
  metadataBase: new URL(productionHost ? `https://${productionHost}` : 'http://localhost:3000'),
  title: 'Fluxi — seu fluxo de caixa pessoal',
  description: 'Planeje o fluxo de caixa das suas finanças pessoais.',
  applicationName: 'Fluxi',
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Fluxi',
    title: 'Fluxi — seu fluxo de caixa pessoal',
    description: 'Planeje o fluxo de caixa das suas finanças pessoais.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Fluxi — seu fluxo de caixa pessoal',
    description: 'Planeje o fluxo de caixa das suas finanças pessoais.',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning className={inter.variable}>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <AutoSignIn />
          <Toaster />
        </ThemeProvider>
        {/* Only production deployments on Vercel serve the analytics endpoint. */}
        {process.env.VERCEL_ENV === 'production' ? <WebAnalytics /> : null}
      </body>
    </html>
  )
}
