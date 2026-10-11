import type { ReactElement } from 'react'
import type { IconType } from 'react-icons'
import DashboardShell from './DashboardShell'

interface ModulePageProps {
  title: string
  eyebrow: string
  description: string
  icon: IconType
}

export default function ModulePage({
  title,
  eyebrow,
  description,
  icon: Icon
}: ModulePageProps): ReactElement {
  return (
    <DashboardShell pageTitle={title}>
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(17rem,0.42fr)]">
        <div className="page-intro">
          <div className="page-intro-content">
            <div className="bg-brand-100/80 text-brand-700 grid size-12 place-items-center rounded-lg shadow-inner ring-1 shadow-white/70 ring-white/70">
              <Icon className="size-5" aria-hidden="true" />
            </div>
            <p className="eyebrow mt-6">{eyebrow}</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{title}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
          </div>
        </div>
        <aside className="panel relative overflow-hidden p-6 sm:p-7">
          <div className="relative">
            <p className="eyebrow">Availability</p>
            <div className="mt-5 grid size-11 place-items-center rounded-lg bg-amber-50/80 text-amber-700 ring-1 ring-amber-100">
              <span className="size-2 rounded-full bg-amber-500" aria-hidden="true" />
            </div>
            <p className="mt-5 text-sm font-semibold text-slate-800">Not yet implemented</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              This page is reserved for a future implementation. It does not currently display or
              record production data.
            </p>
          </div>
        </aside>
      </section>
    </DashboardShell>
  )
}
