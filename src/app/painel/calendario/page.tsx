import { redirect } from 'next/navigation'

/** The calendar moved to `/painel`; old links keep working. */
export default async function OldCalendarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(await searchParams)) {
    const first = Array.isArray(value) ? value[0] : value
    if (first !== undefined && (key === 'mes' || key === 'conta')) params.set(key, first)
  }
  const query = params.toString()
  redirect(query === '' ? '/painel' : `/painel?${query}`)
}
