import type { PropsWithChildren, ReactElement } from 'react'

export function CenteredPage({ children }: PropsWithChildren): ReactElement {
  return (
    <main className="bg-ink-950 relative grid min-h-screen place-items-center overflow-hidden px-5 py-10 text-neutral-950">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_12%_8%,rgba(168,85,247,0.34),transparent_30%),radial-gradient(circle_at_88%_82%,rgba(99,102,241,0.27),transparent_34%),linear-gradient(135deg,#171221_0%,#110d1a_100%)]" />
      <div className="absolute inset-0 [background-image:linear-gradient(rgba(255,255,255,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.055)_1px,transparent_1px)] [background-size:2rem_2rem] opacity-30" />
      <div className="mesh-glow -right-32 -bottom-40 size-96 bg-mauve-600/25" />
      <div className="mesh-glow -top-36 left-1/3 size-72 bg-indigo-500/20" />
      <section className="glass-surface relative w-full max-w-md overflow-hidden rounded-[2rem] border-white/75 p-7 shadow-2xl shadow-black/20 sm:p-9">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 -right-20 size-48 rounded-full bg-white/25 blur-3xl"
        />
        <div className="relative">
          <div className="mb-7 flex items-center justify-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-mauve-600 to-indigo-600 text-2xl font-semibold text-white shadow-lg shadow-mauve-950/25">
              +
            </div>
            <div>
              <p className="font-semibold tracking-tight text-neutral-950">Med Prix</p>
              <p className="text-xs text-neutral-500">Pharmacy management</p>
            </div>
          </div>
          {children}
        </div>
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
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-950">{title}</h1>
      <p className="mt-1.5 text-sm leading-6 text-neutral-500">{description}</p>
    </header>
  )
}
