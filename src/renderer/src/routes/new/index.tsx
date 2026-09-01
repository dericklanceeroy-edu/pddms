import { CenteredPageHeader } from '@renderer/components/layout/CenteredPage'
import { createFileRoute, Link } from '@tanstack/react-router'
import type { ReactElement } from 'react'

export const Route = createFileRoute('/new/')({
  component: RouteComponent
})

function RouteComponent(): ReactElement {
  return (
    <div>
      <CenteredPageHeader
        title="Welcome to Med Prix"
        description="Create the master account to secure this installation."
      />
      <Link to="/new/master" className="primary-button w-full">
        Get started
      </Link>
    </div>
  )
}
