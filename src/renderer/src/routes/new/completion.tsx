import { CenteredPageHeader } from '@renderer/components/layout/CenteredPage'
import { useDelay } from '@renderer/hooks/useDelay'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { type MotionNodeAnimationOptions, motion } from 'motion/react'
import type { ReactElement } from 'react'

export const Route = createFileRoute('/new/completion')({
  component: RouteComponent
})

function RouteComponent(): ReactElement {
  const navigate = useNavigate()
  const completionDelaySeconds = 3

  const progress: MotionNodeAnimationOptions = {
    initial: { scaleX: 0 },
    animate: { scaleX: 1 },
    transition: {
      duration: completionDelaySeconds,
      ease: 'easeInOut'
    }
  }

  useDelay(() => {
    navigate({ to: '/' })
  }, completionDelaySeconds)

  return (
    <div>
      <CenteredPageHeader title="You're all set!" description="You may now use the application." />
      <Link to="/" className="primary-button relative w-full overflow-hidden">
        <motion.span
          {...progress}
          aria-hidden="true"
          className="absolute inset-0 origin-left bg-mauve-600"
        />
        <span className="relative">Finish</span>
      </Link>
    </div>
  )
}
