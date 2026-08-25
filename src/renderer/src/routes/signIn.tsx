import TypedLink from '@renderer/components/TypedLink'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/signIn')({
  component: RouteComponent
})

// To-do: Create a master contact page and set its route to
// the '<TypedLink>'.
function RouteComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center gap-4">
      <header>
        <h1>Sign in to your account</h1>
        <p>
          If you encounter any issues contact the{' '}
          <TypedLink to={'*' as any} className="text-sky-800 underline">
            master
          </TypedLink>{' '}
          account.
        </p>
      </header>
    </div>
  )
}
