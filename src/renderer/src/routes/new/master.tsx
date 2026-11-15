import Form from '@renderer/components/Form/Form'
import { CenteredPageHeader } from '@renderer/components/layout/CenteredPage'
import FormField from '@renderer/components/ui/FormField'
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

  const submit = async ({
    confirmPassword,
    ...credentials
  }: MasterSetup & { confirmPassword: string }): Promise<void> => {
    setError('')
    // Note: There is no password recovery for the Master account, so the password is typed twice.
    if (credentials.password !== confirmPassword) {
      setError('The passwords do not match. Type the same password in both fields.')
      return
    }
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
        title="Set Up the Master Account"
        description="This first account controls system access and administration."
      />
      <Form<MasterSetup & { confirmPassword: string }>
        noValidate
        onSubmit={submit}
        className="space-y-4"
      >
        <FormField label="Full Name" required>
          <Form.Text
            name="fullName"
            rule="personName"
            placeholder="e.g. Juan Dela Cruz"
            autoComplete="name"
            required
            minLength={2}
            maxLength={120}
            disabled={isSubmitting}
          />
        </FormField>
        <FormField label="Email" required hint="Used to reach the account holder about the system.">
          <Form.Text
            name="email"
            rule="email"
            type="email"
            placeholder="e.g. juan@example.com"
            autoComplete="email"
            required
            maxLength={254}
            disabled={isSubmitting}
          />
        </FormField>
        <FormField label="Mobile Number" required hint="11 digits starting with 09.">
          <Form.Text
            name="phone"
            rule="phone"
            inputMode="numeric"
            placeholder="e.g. 09171234567"
            autoComplete="tel"
            required
            maxLength={11}
            disabled={isSubmitting}
          />
        </FormField>
        <FormField
          label="Username"
          required
          hint="At least 4 characters. You will use this to sign in."
        >
          <Form.Text
            name="username"
            rule="username"
            placeholder="e.g. juan.delacruz"
            autoComplete="username"
            required
            minLength={4}
            maxLength={32}
            disabled={isSubmitting}
          />
        </FormField>
        <FormField
          label="Password"
          required
          hint="At least 8 characters with a letter and a number. Keep it private; this account controls the whole system."
        >
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
        </FormField>
        <FormField label="Confirm Password" required hint="Type the same password again.">
          <Form.Password
            name="confirmPassword"
            placeholder="Repeat the password"
            autoComplete="new-password"
            show={BsEyeFill}
            hide={BsEyeSlashFill}
            required
            minLength={8}
            disabled={isSubmitting}
          />
        </FormField>
        {error && (
          <p role="alert" className="status-message border-rose-200 bg-rose-50 text-rose-800">
            {error}
          </p>
        )}
        <button type="submit" disabled={isSubmitting} className="primary-button w-full">
          {isSubmitting ? 'Creating Account…' : 'Create Master Account'}
        </button>
      </Form>
    </div>
  )
}
