import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/onboarding')({
  component: OnboardingComponent
})

export default function OnboardingComponent() {
  return (
    <div className="grid min-h-screen place-items-center">
      <p>Place your component here at the center.</p>
    </div>
  )
}

function Account() {
  return <div>Not yet implemented</div>
}

function Completion() {
  return <div>Not yet implemented</div>
}
