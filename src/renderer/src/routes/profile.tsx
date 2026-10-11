import DashboardShell from '@renderer/components/dashboard/DashboardShell'
import FormField from '@renderer/components/ui/FormField'
import { useAccount } from '@renderer/hooks/useAccount'
import { channels } from '@shared/constants'
import { profileUpdateSchema } from '@shared/schemas'
import { createFileRoute } from '@tanstack/react-router'
import { useState, type ReactElement } from 'react'

export const Route = createFileRoute('/profile')({ component: Profile })
function Profile(): ReactElement {
  const { account, signOut } = useAccount()
  const [fullName, setFullName] = useState(account?.fullName ?? '')
  const [username, setUsername] = useState(account?.username ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <DashboardShell pageTitle="My profile">
      <form
        className="panel mx-auto max-w-xl space-y-4 p-5"
        onSubmit={(event) => {
          event.preventDefault()
          setError('')
          const parsed = profileUpdateSchema.safeParse({
            fullName,
            username,
            currentPassword,
            ...(password ? { password } : {})
          })
          if (!parsed.success) {
            setError(
              parsed.error.issues
                .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
                .join(' ')
            )
            return
          }
          setBusy(true)
          void window.electron.ipcRenderer
            .invoke(channels.account.updateProfile, parsed.data)
            .then(async (result) => {
              if (!result.success) throw new Error(result.error)
              await signOut()
            })
            .catch((cause) =>
              setError(cause instanceof Error ? cause.message : 'Profile update failed.')
            )
            .finally(() => setBusy(false))
        }}
      >
        <h2 className="page-title">My profile</h2>
        <p className="text-sm text-slate-500">
          Role: {account?.role}. Your access level is set by the master account. Saving asks for
          your current password and signs you out so you can sign in with the new details.
        </p>
        {error && (
          <p role="alert" className="status-message border-rose-200 bg-rose-50 text-rose-800">
            {error}
          </p>
        )}
        <fieldset className="space-y-4" disabled={busy}>
          <FormField label="Full name" required>
            <input
              required
              className="field"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </FormField>
          <FormField label="Username" required>
            <input
              required
              className="field"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </FormField>
          <FormField label="Current password" required hint="Needed to confirm any change.">
            <input
              required
              type="password"
              autoComplete="current-password"
              className="field"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </FormField>
          <FormField
            label="New password"
            hint="Leave blank to keep your current password. At least 8 characters."
          >
            <input
              type="password"
              autoComplete="new-password"
              className="field"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </FormField>
          <button className="primary-button">{busy ? 'Saving…' : 'Save and sign out'}</button>
        </fieldset>
      </form>
    </DashboardShell>
  )
}
