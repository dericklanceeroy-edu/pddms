import ModulePage from '@renderer/components/dashboard/ModulePage'
import { createFileRoute } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import { FiBarChart2 } from 'react-icons/fi'

export const Route = createFileRoute('/reports')({ component: RouteComponent })

function RouteComponent(): ReactElement {
  return (
    <ModulePage
      title="Reports"
      eyebrow="Business intelligence"
      description="Review sales performance, inventory movement, stock valuation, and financial summaries."
      icon={FiBarChart2}
    />
  )
}
