/** Title row of a painel page. */
export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h1>
      {children}
    </div>
  )
}
