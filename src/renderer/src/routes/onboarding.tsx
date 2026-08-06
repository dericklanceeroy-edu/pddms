import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/onboarding')({
  component: OnboardingComponent
})

function OnboardingComponent() {
  return <div>{Route.fullPath}</div>
}
