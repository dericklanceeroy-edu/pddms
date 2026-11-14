import Form from '@renderer/components/Form/Form'
import { CenteredPage, CenteredPageHeader } from '@renderer/components/layout/CenteredPage'
import FormField from '@renderer/components/ui/FormField'
import { RESTORE_NOTICE_KEY } from '@renderer/data/restoreNotice'
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
  // Note: Shown once after a backup restore reloads the app; read during the first render.
  const [notice] = useState(() => {
    try {
      const value = window.sessionStorage.getItem(RESTORE_NOTICE_KEY) ?? ''
      window.sessionStorage.removeItem(RESTORE_NOTICE_KEY)
      return value
    } catch {
      return ''
    }
  })

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
        title="Sign In to Your Account"
        description="Use the account assigned to you by the pharmacy."
      />
      {notice && (
        <p
          role="status"
          className="status-message mb-5 border-emerald-200 bg-emerald-50 break-words text-emerald-800"
        >
          {notice}
        </p>
      )}
      <Form<Credentials> noValidate onSubmit={submit} className="space-y-4">
        <FormField label="Username" required>
          <Form.Text
            name="username"
            rule="username"
            placeholder="e.g. juan.delacruz"
            autoComplete="username"
            required
            minLength={4}
            disabled={isSubmitting}
          />
        </FormField>
        <FormField label="Password" required>
          <Form.Password
            name="password"
            placeholder="Your password"
            autoComplete="current-password"
            required
            minLength={8}
            disabled={isSubmitting}
            show={BsEyeFill}
            hide={BsEyeSlashFill}
          />
        </FormField>
        {error && (
          <p role="alert" className="status-message border-rose-200 bg-rose-50 text-rose-800">
            {error}
          </p>
        )}
        <button type="submit" disabled={isSubmitting} className="primary-button w-full">
          {isSubmitting ? 'Signing In…' : 'Sign In'}
        </button>
      </Form>
      <p className="mt-6 text-center text-xs leading-5 text-slate-500">
        Having trouble signing in? Contact the master account holder.
      </p>
    </CenteredPage>
  )
}
