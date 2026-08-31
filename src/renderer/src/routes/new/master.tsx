import Form from '@renderer/components/Form/Form'
import { CenteredPageHeader } from '@renderer/components/layout/CenteredPage'
import { useAccount } from '@renderer/hooks/useAccount'
import { createAccount } from '@renderer/services/account'
import type { Credentials } from '@shared/types'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Button } from 'flowbite-react'
import { useState, type ReactElement } from 'react'
import { BsEyeFill, BsEyeSlashFill } from 'react-icons/bs'

export const Route = createFileRoute('/new/master')({
  component: RouteComponent
})

function RouteComponent(): ReactElement {
  const navigate = useNavigate()
  const { completeSetup } = useAccount()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submit = async (credentials: Credentials): Promise<void> => {
    setIsSubmitting(true)
    setError('')

    const result = await createAccount({ ...credentials, role: 'master' })

    if (!result.success) {
      setError(result.error ?? 'Unable to create the master account.')
      setIsSubmitting(false)
      return
    }

    completeSetup()
    await navigate({ to: '/new/completion' })
  }

  return (
    <div>
      <CenteredPageHeader
        title="Set up master account"
        description="You can edit this later in settings."
      />
      <Form<Credentials> onSubmit={submit} className="space-y-4">
        <Form.Text
          name="username"
          color="primary"
          placeholder="Username"
          autoComplete="username"
          required
          minLength={4}
          disabled={isSubmitting}
        />
        <Form.Password
          name="password"
          color="primary"
          placeholder="Password"
          autoComplete="new-password"
          required
          minLength={8}
          disabled={isSubmitting}
          show={BsEyeFill}
          hide={BsEyeSlashFill}
        />
        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        )}
        <Button type="submit" color="primary" disabled={isSubmitting} className="w-full">
          {isSubmitting ? 'Creating account…' : 'Continue'}
        </Button>
      </Form>
    </div>
  )
}
