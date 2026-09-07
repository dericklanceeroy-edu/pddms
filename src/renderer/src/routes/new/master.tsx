import Form from '@renderer/components/Form/Form'
import { CenteredPageHeader } from '@renderer/components/layout/CenteredPage'
import { useAccount } from '@renderer/hooks/useAccount'
import { createMaster, type MasterSetup } from '@renderer/services/setup'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState, type ReactElement } from 'react'
import { BsEyeFill, BsEyeSlashFill } from 'react-icons/bs'

export const Route = createFileRoute('/new/master')({
  component: RouteComponent
})

function RouteComponent(): ReactElement {
  const navigate = useNavigate()
  const { completeSetup } = useAccount()
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const submit = async (credentials: MasterSetup): Promise<void> => {
    setError('')
    setIsSubmitting(true)
    const result = await createMaster(credentials)

    if (!result.success || !result.account) {
      setError(result.error ?? 'Unable to create the master account.')
      setIsSubmitting(false)
      return
    }

    completeSetup(result.account)
    await navigate({ to: '/new/completion' })
  }

  return (
    <div>
      <CenteredPageHeader
        title="Set up master account"
        description="This first account controls system access and administration."
      />
      <Form<MasterSetup> noValidate onSubmit={submit} className="space-y-4">
        <Form.Text
          name="fullName"
          placeholder="e.g. Juan Dela Cruz"
          autoComplete="name"
          required
          minLength={2}
          disabled={isSubmitting}
        />
        <Form.Text
          name="username"
          placeholder="e.g. juan.delacruz"
          autoComplete="username"
          required
          minLength={4}
          disabled={isSubmitting}
        />
        <Form.Password
          name="password"
          placeholder="At least 8 characters"
          autoComplete="new-password"
          show={BsEyeFill}
          hide={BsEyeSlashFill}
          required
          minLength={8}
          disabled={isSubmitting}
        />
        {error && (
          <p
            role="alert"
            className="status-message border-rose-200/80 bg-rose-50/75 text-rose-700 backdrop-blur-md"
          >
            {error}
          </p>
        )}
        <button type="submit" disabled={isSubmitting} className="primary-button w-full">
          {isSubmitting ? 'Creating account…' : 'Create master account'}
        </button>
      </Form>
    </div>
  )
}
