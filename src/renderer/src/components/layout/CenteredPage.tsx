import type { PropsWithChildren, ReactElement } from 'react'

export function CenteredPage({ children }: PropsWithChildren): ReactElement {
  return (
    <main className="setup-stage">
      <div className="bg-aurora-lilac/35 pointer-events-none absolute -top-44 left-[16%] h-[38rem] w-[24rem] rotate-[28deg] rounded-[50%] blur-3xl" />
      <div className="bg-aurora-peach/45 pointer-events-none absolute -right-40 bottom-[-12rem] h-[36rem] w-[24rem] rotate-[-28deg] rounded-[50%] blur-3xl" />
      <div className="mesh-glow bg-aurora-blue/40 -right-32 -bottom-40 size-96" />
      <div className="mesh-glow -top-36 left-1/3 size-72 bg-mauve-400/20" />
      <section className="setup-frame">
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
