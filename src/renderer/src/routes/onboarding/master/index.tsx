import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/onboarding/master/')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/onboarding/master/"!</div>
}
