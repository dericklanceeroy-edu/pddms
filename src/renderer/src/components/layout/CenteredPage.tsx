import type { PropsWithChildren, ReactElement } from 'react'

export function CenteredPage({ children }: PropsWithChildren): ReactElement {
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-neutral-950 px-5 py-10 text-neutral-950">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(147,51,234,0.3),transparent_42%)]" />
      <div className="absolute -right-32 -bottom-40 size-96 rounded-full bg-mauve-700/20 blur-3xl" />
      <section className="relative w-full max-w-md rounded-3xl border border-white/10 bg-white p-7 shadow-2xl shadow-black/30 sm:p-9">
        <div className="mb-7 flex items-center justify-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-mauve-700 text-2xl font-semibold text-white shadow-lg shadow-mauve-950/20">
            +
          </div>
          <div>
            <p className="font-semibold tracking-tight text-neutral-950">Med Prix</p>
            <p className="text-xs text-neutral-500">Pharmacy management</p>
          </div>
        </div>
        {children}
      </section>
    </main>
  )
}

export function CenteredPageHeader({
  title,
  description
}: {
  title: string
  description: string
}): ReactElement {
  return (
    <header className="mb-5 text-center">
      <h1 className="text-xl font-semibold tracking-tight text-neutral-950">{title}</h1>
      <p className="mt-1 text-sm text-neutral-500">{description}</p>
    </header>
  )
}
