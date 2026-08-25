import TypedLink from '@renderer/components/TypedLink'
import { useDelay } from '@renderer/hooks/useDelay'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Button } from 'flowbite-react'
import { type MotionNodeAnimationOptions, motion } from 'motion/react'

export const Route = createFileRoute('/onboarding/completion')({
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
    <div className="space-y-4">
      <div className="text-center">
        <h1 className="text-xl font-semibold">You're all set!</h1>
        <p className="text-neutral-500">You may now use the application.</p>
      </div>
      <Button as={TypedLink} to="/" className="bg-transparent! p-0 outline-none focus:ring-0">
        <motion.div
          animate={animate}
          transition={transition}
          style={{
            background: 'linear-gradient(to right, var(--color-mauve-600) 50%, transparent 50%)',
            backgroundSize: '200% 100%'
          }}
          className="h-full w-full cursor-pointer rounded border-2 border-mauve-600 text-white"
        >
          <motion.div
            animate={animate}
            transition={transition}
            style={{
              background: 'linear-gradient(to right, white 50%, var(--color-mauve-600) 50%)',
              backgroundSize: '200% 100%',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              color: 'transparent'
            }}
            className="grid h-full items-center"
          >
            Finish
          </motion.div>
        </motion.div>
      </Button>
    </div>
  )
}
