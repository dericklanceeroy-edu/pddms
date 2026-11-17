import type { ReactElement, ReactNode } from 'react'
import InfoTip from './InfoTip'

/**
 * Standard page heading: section trail, title and the page's main actions.
 *
 * Note: The description sits behind an "i" button beside the title (QA Tests 3: pages carried too
 * much explanatory text), so the page opens on its content.
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
        <div className="mt-0.5 flex items-center gap-1.5">
          <h1 className="page-title">{title}</h1>
          {description && <InfoTip label={title}>{description}</InfoTip>}
        </div>
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
