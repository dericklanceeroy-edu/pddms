import type { ReactElement, ReactNode } from 'react'

/**
 * Standard page heading: section trail, title, one-line description and the page's main actions.
 */
export default function PageHeader({
  section,
  title,
  description,
  actions
}: {
  /** Parent area shown before the title, e.g. "Stock & purchasing". */
  section?: string
  title: string
  description?: ReactNode
  actions?: ReactNode
}): ReactElement {
  return (
    <header className="page-header">
      <div className="min-w-0">
        {section && <p className="eyebrow">{section}</p>}
        <h2 className="page-title mt-0.5">{title}</h2>
        {description && <p className="page-subtitle max-w-3xl">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

/**
 * Explains an empty list and, when given, offers the next step.
 */
export function EmptyState({
  title,
  description,
  action
}: {
  title: string
  description?: ReactNode
  action?: ReactNode
}): ReactElement {
  return (
    <div className="grid min-h-48 place-items-center p-8 text-center">
      <div className="max-w-md">
        <p className="font-medium text-slate-800">{title}</p>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
        {action && <div className="mt-4 flex justify-center">{action}</div>}
      </div>
    </div>
  )
}
