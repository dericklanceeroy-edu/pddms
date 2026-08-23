import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/onboarding/staff/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/onboarding/staff/"!</div>
}
