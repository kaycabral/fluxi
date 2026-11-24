import { BrandLink } from '@/components/brand-link'
import { Header } from '@/components/header'
import { SignOutButton } from './sign-out-button'

export function Topbar() {
  return (
    <Header>
      <BrandLink href="/painel" className="text-base font-bold tracking-tight md:text-lg">
        Fluxi
      </BrandLink>
      <SignOutButton />
    </Header>
  )
}
