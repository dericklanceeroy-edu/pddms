import {
  PasswordControlsProvider,
  PasswordInput,
  PasswordToggle
} from '@renderer/components/PasswordControls'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/onboarding/master/')({
  component: RouteComponent
})

function RouteComponent() {
  return (
    <div className="grid min-h-screen place-content-center gap-4">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Setup master account</h1>
        <p className="text-neutral-500">You can edit this at the settings.</p>
      </div>
      <form className="flex flex-col gap-4">
        <input
          placeholder="Username"
          className="rounded bg-neutral-100 px-4 py-2 outline-amber-500"
          required
        />
        <PasswordControlsProvider>
          <div className="flex items-center rounded bg-neutral-100 focus-within:outline-2 focus-within:outline-amber-500">
            <PasswordInput
              placeholder="Password"
              className="flex-1 px-4 py-2 outline-none"
              required
            />
            <PasswordToggle type="button" className="h-full cursor-pointer px-4 text-neutral-500" />
          </div>
        </PasswordControlsProvider>
        <button
          type="submit"
          className="cursor-pointer rounded bg-mauve-600 px-4 py-2 font-semibold text-white"
        >
          Continue
        </button>
      </form>
    </div>
  )
}
