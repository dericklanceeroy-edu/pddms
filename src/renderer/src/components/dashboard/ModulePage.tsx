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
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="grid size-12 place-items-center rounded-xl bg-mauve-50 text-mauve-700">
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <p className="mt-6 text-[0.68rem] font-semibold tracking-[0.17em] text-mauve-700 uppercase">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-950">{title}</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-500">{description}</p>
        <div className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-5 py-8 text-center">
          <p className="text-sm font-medium text-neutral-700">Module workspace ready</p>
          <p className="mt-1 text-xs text-neutral-500">
            Features for this module can now be added without changing navigation.
          </p>
        </div>
      </section>
    </DashboardShell>
  )
}
