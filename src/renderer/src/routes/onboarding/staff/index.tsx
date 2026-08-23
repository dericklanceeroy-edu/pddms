import TypedLink from '@renderer/components/TypedLink'
import { useDelay } from '@renderer/hooks/useDelay'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { type MotionNodeAnimationOptions, motion } from 'motion/react'

export const Route = createFileRoute('/onboarding/staff/')({
  component: RouteComponent
})

function RouteComponent() {
  const navigate = useNavigate()

  const { animate, transition }: MotionNodeAnimationOptions = {
    animate: {
      backgroundPosition: ['100% 0%', '0% 0%']
    },
    transition: {
      duration: 3,
      ease: 'easeInOut'
    }
  }

  useDelay(() => {
    navigate({ to: '/' })
  }, transition.duration!)

  return (
    <div className="grid min-h-screen place-content-center gap-4">
      <div className="text-center">
        <h1 className="text-xl font-semibold">You're all set!</h1>
        <p className="text-neutral-500">You may now use the application.</p>
      </div>
      <motion.button
        animate={animate}
        transition={transition}
        style={{
          background: 'linear-gradient(to right, var(--color-mauve-600) 50%, transparent 50%)',
          backgroundSize: '200% 100%'
        }}
        className="cursor-pointer rounded border-2 border-mauve-600 px-4 py-2 font-semibold text-white"
      >
        <TypedLink to={'/'}>
          <motion.p
            animate={animate}
            transition={transition}
            style={{
              backgroundImage: 'linear-gradient(to right, white 50%, var(--color-mauve-600) 50%)',
              backgroundSize: '200% 100%',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              color: 'transparent'
            }}
          >
            Finish
          </motion.p>
        </TypedLink>
      </motion.button>
    </div>
  )
}
