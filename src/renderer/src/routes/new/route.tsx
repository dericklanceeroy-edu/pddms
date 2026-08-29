import { CenteredPage } from '@renderer/components/layout/CenteredPage'
import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/new')({
  component: RouteComponent
})

function RouteComponent() {
  return (
    <CenteredPage>
      <Outlet />
    </CenteredPage>
  )
}
