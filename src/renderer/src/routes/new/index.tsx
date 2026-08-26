import { createFileRoute, Link } from '@tanstack/react-router'
import { Button } from 'flowbite-react'

export const Route = createFileRoute('/new/')({
  component: RouteComponent
})

function RouteComponent() {
  return (
    <div className="space-y-4">
      <header className="text-center">
        <h1 className="text-xl font-semibold">Successfully installed</h1>
        <p className="text-neutral-500">Setup your workspace to use it.</p>
      </header>
      <Button as={Link} to="/new/master" color="primary">
        Get started
      </Button>
    </div>
  )
}
