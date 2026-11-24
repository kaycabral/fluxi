import { Container } from '@/components/container'
import { getServerUser } from '@/lib/auth/server'

export default async function PainelPage() {
  const user = await getServerUser()

  return (
    <Container className="p-5 md:p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Fluxi</h1>
      {user?.email && <p className="text-muted-foreground mt-1 text-sm">{user.email}</p>}
    </Container>
  )
}
