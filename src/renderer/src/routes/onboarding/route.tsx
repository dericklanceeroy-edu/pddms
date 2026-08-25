import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/onboarding')({
  component: RouteComponent
})

function RouteComponent() {
  return (
    <div className="grid min-h-screen place-content-center gap-4">
      <Outlet />
    </div>
  )
}
