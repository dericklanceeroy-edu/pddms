import { routes } from '@renderer/constants'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute(routes.index)({
  component: HomeComponent
})

function HomeComponent() {
  return <div>Welcome to '{Route.fullPath}'!</div>
}
