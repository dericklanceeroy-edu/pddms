import type { PropsWithChildren, ReactElement } from 'react'

export function CenteredPage({ children }: PropsWithChildren): ReactElement {
  return (
    <main className="setup-stage">
      <section className="setup-frame">
        <div className="relative">
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <div
              className="bg-brand-600 grid size-14 place-items-center rounded-xl text-3xl font-bold text-white shadow-sm"
              aria-hidden="true"
            >
              +
            </div>
            <p className="text-xl leading-tight font-bold tracking-tight text-slate-950">
              Med Prix Distributor and Pharmacy
            </p>
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
      <h1 className="text-2xl leading-tight font-bold tracking-tight text-slate-950">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
    </header>
  )
}
