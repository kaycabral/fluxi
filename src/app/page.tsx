import { BrandMark } from '@/components/brand-mark'
import { Footer } from '@/components/footer'
import { Suspense } from 'react'
import { SignInButton } from './_components/sign-in-button'
import { SignedInRedirect } from './_components/signed-in-redirect'

export default function LandingPage() {
  return (
    <div className="bg-background text-foreground flex min-h-screen flex-col">
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-5 text-center">
        <div className="flex flex-col items-center gap-3">
          <BrandMark className="size-16" />
          <h1 className="text-4xl font-bold tracking-tight">Fluxi</h1>
          <p className="max-w-[48ch] text-lg">
            Planeje o fluxo de caixa das suas finanças pessoais.
          </p>
          <p className="text-muted-foreground max-w-[52ch]">
            Cadastre transações recorrentes, veja o saldo ao longo dos meses, acompanhe as contas a
            pagar e divida o orçamento em grupos.
          </p>
        </div>
        {/* useGoogleSignIn reads useSearchParams: Suspense keeps the shell static-safe. */}
        <Suspense fallback={null}>
          <SignInButton />
        </Suspense>
      </main>
      <Footer />
      {/* The landing itself is static; only this check runs per request. */}
      <Suspense fallback={null}>
        <SignedInRedirect />
      </Suspense>
    </div>
  )
}
