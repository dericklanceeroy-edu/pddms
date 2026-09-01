import Form from '@renderer/components/Form/Form'
import { CenteredPage, CenteredPageHeader } from '@renderer/components/layout/CenteredPage'
import { useAccount } from '@renderer/hooks/useAccount'
import type { Credentials } from '@shared/types'
import { createFileRoute } from '@tanstack/react-router'
import { useState, type ReactElement } from 'react'
import { BsEyeFill, BsEyeSlashFill } from 'react-icons/bs'

export const Route = createFileRoute('/signIn')({
  component: RouteComponent
})

function RouteComponent(): ReactElement {
  const { signIn } = useAccount()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const submit = async (credentials: Credentials): Promise<void> => {
    setIsSubmitting(true)
    setError('')

    const result = await signIn(credentials)

    if (!result.success) {
      setError(result.error ?? 'The username or password is incorrect.')
      setIsSubmitting(false)
      return
    }
  }

  return (
    <CenteredPage>
      <CenteredPageHeader
        title="Sign in to your account"
        description="Use your assigned pharmacy account."
      />
      <p className="mb-5 text-center text-sm text-neutral-500">
        If you encounter any issues, contact the master account holder.
      </p>
      <Form<Credentials> onSubmit={submit} className="space-y-4">
        <Form.Text
          name="username"
          placeholder="Username"
          autoComplete="username"
          required
          minLength={4}
          disabled={isSubmitting}
        />
        <Form.Password
          name="password"
          placeholder="Password"
          autoComplete="current-password"
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
        <button type="submit" disabled={isSubmitting} className="primary-button w-full">
          {isSubmitting ? 'Signing in…' : 'Continue'}
        </button>
      </Form>
    </CenteredPage>
  )
}
