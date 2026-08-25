import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/onboarding')({
  component: RouteComponent
})

function RouteComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center gap-4">
      <Outlet />
    </div>
  )
}
