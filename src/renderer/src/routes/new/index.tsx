import { CenteredPageHeader } from '@renderer/components/layout/CenteredPage'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Button } from 'flowbite-react'

export const Route = createFileRoute('/new/')({
  component: RouteComponent
})

function RouteComponent() {
  return (
    <div>
      <CenteredPageHeader
        title="Successfully installed"
        description="Set up your workspace to use it."
      />
      <Button as={Link} to="/new/master" color="primary" className="w-full">
        Get started
      </Button>
    </div>
  )
}
