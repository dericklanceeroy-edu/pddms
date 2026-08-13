import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { BsEyeFill } from 'react-icons/bs'

export const Route = createFileRoute('/onboarding')({
  component: OnboardingComponent
})

export default function OnboardingComponent() {
  const [completed, setCompleted] = useState(false)

  return completed ? <Completion /> : <Account onProceed={() => setCompleted(true)} />
}

function Account({ onProceed }: { onProceed: () => void }) {
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="grid min-h-screen place-content-center gap-4">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Setup administrator account</h1>
        <p className="text-neutral-500">You can edit this at the settings.</p>
      </div>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          onProceed()
        }}
      >
        <input
          placeholder="Username"
          className="rounded bg-neutral-100 px-4 py-2 outline-amber-500"
        />
        <div className="flex items-center rounded bg-neutral-100 focus-within:outline-2 focus-within:outline-amber-500">
          <input
            type={showPassword ? 'text' : 'password'}
            placeholder="Password"
            className="flex-1 px-4 py-2 outline-none"
          />
          <button
            type="button"
            onClick={() => setShowPassword((p) => !p)}
            className="h-full cursor-pointer px-4"
          >
            <BsEyeFill className="text-neutral-500" />
          </button>
        </div>
        <button
          type="submit"
          className="cursor-pointer rounded bg-mauve-600 px-4 py-2 font-semibold text-white"
        >
          Proceeed
        </button>
      </form>
    </div>
  )
}

function Completion() {
  return (
    <div className="grid min-h-screen place-content-center gap-4">
      <div className="text-center">
        <h1 className="text-xl font-semibold">You're all set!</h1>
        <p className="text-neutral-500">You may now use the application.</p>
      </div>
      <button className="cursor-pointer rounded bg-mauve-600 px-4 py-2 font-semibold text-white">
        Continue
      </button>
    </div>
  )
}
