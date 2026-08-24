import TypedLink from '@renderer/components/TypedLink'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/onboarding/')({
  component: RouteComponent
})

function RouteComponent() {
  return (
    <div className="grid min-h-screen place-content-center gap-4">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Successfully installed</h1>
        <p className="text-neutral-500">Setup your workspace to use it.</p>
      </div>
      <TypedLink
        to="/onboarding/master/"
        className="cursor-pointer rounded bg-mauve-600 px-4 py-2 text-center text-white"
      >
        Get started
      </TypedLink>
    </div>
  )
}
