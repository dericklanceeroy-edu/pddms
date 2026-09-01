import { CenteredPage } from '@renderer/components/layout/CenteredPage'
import { createFileRoute, Outlet } from '@tanstack/react-router'
import type { ReactElement } from 'react'

export const Route = createFileRoute('/new')({
  component: RouteComponent
})

function RouteComponent(): ReactElement {
  return (
    <CenteredPage>
      <Outlet />
    </CenteredPage>
  )
}
