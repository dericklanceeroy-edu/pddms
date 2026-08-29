import Form from '@renderer/components/Form/Form'
import { CenteredPageHeader } from '@renderer/components/layout/CenteredPage'
import type { NewAccount } from '@shared/types'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Button } from 'flowbite-react'
import { BsEyeFill, BsEyeSlashFill } from 'react-icons/bs'

export const Route = createFileRoute('/new/master')({
  component: RouteComponent
})

function RouteComponent() {
  const navigate = useNavigate()

  return (
    <div>
      <CenteredPageHeader
        title="Set up master account"
        description="You can edit this later in settings."
      />
      <Form<NewAccount>
        onSubmit={() => {
          navigate({ to: '/new/completion' })
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
        <Button type="submit" color="primary" className="w-full">
          Continue
        </Button>
      </Form>
    </div>
  )
}
