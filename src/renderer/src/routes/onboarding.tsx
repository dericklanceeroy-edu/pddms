import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/onboarding')({
  component: OnboardingComponent
})

function OnboardingComponent() {
  return <div>{Route.fullPath}</div>
}

function Account() {
  return <div>Not yet implemented</div>
}

function Completion() {
  return <div>Not yet implemented</div>
}
