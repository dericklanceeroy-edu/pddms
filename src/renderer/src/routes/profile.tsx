import DashboardShell from '@renderer/components/dashboard/DashboardShell'
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
        <h2 className="text-xl font-semibold">My profile</h2>
        <p className="text-sm text-neutral-500">
          Role: {account?.role}. Security permissions are administrator-controlled. Saving requires
          your current password and signs you out.
        </p>
        {error && (
          <p role="alert" className="text-rose-700">
            {error}
          </p>
        )}
        <fieldset className="space-y-4" disabled={busy}>
          <label className="block">
            Full name
            <input
              required
              className="field"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
            />
          </label>
          <label className="block">
            Username
            <input
              required
              className="field"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label className="block">
            Current password
            <input
              required
              type="password"
              autoComplete="current-password"
              className="field"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </label>
          <label className="block">
            New password (optional)
            <input
              type="password"
              autoComplete="new-password"
              className="field"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button className="primary-button">{busy ? 'Saving…' : 'Save and sign out'}</button>
        </fieldset>
      </form>
    </DashboardShell>
  )
}
