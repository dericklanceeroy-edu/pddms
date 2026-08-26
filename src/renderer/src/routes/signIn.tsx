import Form from '@renderer/components/Form/Form'
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
    <div className="mx-auto flex min-h-screen w-fit flex-col justify-center gap-4">
      <header className="text-center">
        <h1 className="text-xl font-semibold">Sign in to your account</h1>
        <p className="text-neutral-500">
          If you encounter any issues contact the{' '}
          <Link to={'*' as any} className="text-sky-800 underline">
            master
          </Link>{' '}
          account.
        </p>
      </header>
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
    </div>
  )
}
