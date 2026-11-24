import { Footer } from '@/components/footer'
import Link from 'next/link'

type LegalPageProps = {
  title: string
  lastUpdated: string
  children: React.ReactNode
}

// Shared shell of the public legal pages (/privacidade, /termos). Typography is
// styled through descendant selectors so the pages stay plain markup.
export function LegalPage({ title, lastUpdated, children }: LegalPageProps) {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-16 md:px-6">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground text-sm transition-colors"
        >
          ← Fluxi
        </Link>
        <h1 className="mt-6 text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
        <p className="text-muted-foreground mt-4 text-sm">Última atualização: {lastUpdated}</p>
        <div className="[&_a]:text-foreground [&_h2]:text-foreground mt-10 space-y-4 leading-relaxed [&_a]:underline [&_h2]:pt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_li]:mt-1 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6">
          {children}
        </div>
      </main>
      <Footer />
    </div>
  )
}
