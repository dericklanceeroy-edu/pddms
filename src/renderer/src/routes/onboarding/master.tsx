import Form from '@renderer/components/Form/Form'
import type { NewAccount } from '@shared/types'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { BsEyeFill, BsEyeSlashFill } from 'react-icons/bs'

export const Route = createFileRoute('/onboarding/master')({
  component: RouteComponent
})

function RouteComponent() {
  const navigate = useNavigate()

  return (
    <div className="w-[20rem] space-y-4">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Setup master account</h1>
        <p className="text-neutral-500">You can edit this at the settings.</p>
      </div>
      <Form<NewAccount>
        onSubmit={() => {
          navigate({ to: '/onboarding/completion' })
        }}
        className="space-y-4"
      >
        <Form.Text name="username" color="primary" placeholder="Username" />
        <Form.Password
          name="password"
          color="primary"
          placeholder="Password"
          show={BsEyeFill}
          hide={BsEyeSlashFill}
        />
        <Form.Submit>Continue</Form.Submit>
      </Form>
    </div>
  )
}
