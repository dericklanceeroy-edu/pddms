import Form from '@renderer/components/Form/Form'
import { CenteredPage, CenteredPageHeader } from '@renderer/components/layout/CenteredPage'
import { Credentials } from '@shared/types'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { Button } from 'flowbite-react'
import { BsEyeFill, BsEyeSlashFill } from 'react-icons/bs'

export const Route = createFileRoute('/signIn')({
  component: RouteComponent
})

function RouteComponent() {
  const navigate = useNavigate()

  return (
    <CenteredPage>
      <CenteredPageHeader
        title="Sign in to your account"
        description="Use your assigned pharmacy account."
      />
      <p className="mb-5 text-center text-sm text-neutral-500">
        If you encounter any issues contact the{' '}
        <Link to="/users" className="font-medium text-mauve-700 underline">
          master
        </Link>{' '}
        account.
      </p>
      <Form<Credentials>
        onSubmit={() => {
          navigate({ to: '/' })
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
    </CenteredPage>
  )
}
