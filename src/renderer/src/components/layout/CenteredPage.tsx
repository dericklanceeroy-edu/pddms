import type { PropsWithChildren, ReactElement } from 'react'

export function CenteredPage({ children }: PropsWithChildren): ReactElement {
  return (
    <main className="setup-stage">
      <section className="setup-frame">
        <div className="relative">
          <div className="mb-7 flex items-center justify-center gap-3">
            <div className="bg-brand-600 grid size-11 place-items-center rounded-lg text-2xl font-semibold text-white">
              +
            </div>
            <div>
              <p className="font-semibold tracking-tight text-slate-950">Med Prix</p>
              <p className="text-xs text-slate-500">Pharmacy management</p>
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
      <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
      <p className="mt-1.5 text-sm leading-6 text-slate-500">{description}</p>
    </header>
  )
}
