import TypedLink from '@renderer/components/TypedLink'
import { createFileRoute } from '@tanstack/react-router'
import { Button } from 'flowbite-react'

export const Route = createFileRoute('/onboarding/')({
  component: RouteComponent
})

function RouteComponent() {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Successfully installed</h1>
        <p className="text-neutral-500">Setup your workspace to use it.</p>
      </div>
      <Button as={TypedLink} to="/onboarding/master" color="primary">
        Get started
      </Button>
    </div>
  )
}
