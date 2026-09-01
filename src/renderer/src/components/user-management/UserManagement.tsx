import DashboardShell from '@renderer/components/dashboard/DashboardShell'
import {
  roleLabels,
  type ManagedUser,
  type UserFormValues,
  type UserRole
} from '@renderer/data/userManagement'
import { useUserManagement } from '@renderer/hooks/useUserManagement'
import { useMemo, useState, type FormEvent, type ReactElement } from 'react'
import { FiEye, FiPlus, FiSearch, FiShield, FiUsers, FiX } from 'react-icons/fi'

const date = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' })

export default function UserManagement(): ReactElement {
  const management = useUserManagement()
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<UserRole | 'all'>('all')
  const [creating, setCreating] = useState(false)
  const [selected, setSelected] = useState<ManagedUser | null>(null)
  const [feedback, setFeedback] = useState('')
  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase()
    return management.users.filter(
      (user) =>
        (role === 'all' || user.role === role) &&
        (!search || `${user.fullName} ${user.username}`.toLowerCase().includes(search))
    )
  }, [management.users, query, role])

  return (
    <DashboardShell pageTitle="User management">
      <div className="space-y-6">
        <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="eyebrow">System administration</p>
            <h2 className="mt-1 text-3xl font-semibold tracking-tight">User accounts</h2>
            <p className="mt-2 text-sm text-neutral-500">
              Create, find, inspect, block, and unblock verified system users.
            </p>
          </div>
          <button onClick={() => setCreating(true)} className="primary-button">
            <FiPlus /> Create user
          </button>
        </section>
        <section className="grid gap-4 sm:grid-cols-3">
          <Metric label="Total accounts" value={management.users.length} icon={<FiUsers />} />
          <Metric
            label="Active accounts"
            value={management.users.filter((user) => user.status === 'active').length}
            icon={<FiShield />}
          />
          <Metric
            label="Blocked accounts"
            value={management.users.filter((user) => user.status === 'blocked').length}
            icon={<FiShield />}
          />
        </section>
        {(management.error || feedback) && (
          <p
            role={management.error ? 'alert' : 'status'}
            className={`rounded-xl border px-4 py-3 text-sm ${management.error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}
          >
            {management.error || feedback}
          </p>
        )}
        <section className="panel overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 sm:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">Search users</span>
              <FiSearch className="absolute top-3 left-3.5 text-neutral-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name or username"
                className="field mt-0 pl-10"
              />
            </label>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as UserRole | 'all')}
              className="field mt-0 sm:w-48"
              aria-label="Filter by role"
            >
              <option value="all">All roles</option>
              <option value="master">Master</option>
              <option value="manager">Manager</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-neutral-50 text-left">
                <tr>
                  <th className="px-5 py-3">User</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filtered.map((user) => (
                  <tr key={user.id}>
                    <td className="px-5 py-4">
                      <p className="font-semibold">{user.fullName}</p>
                      <p className="text-xs text-neutral-500">@{user.username}</p>
                    </td>
                    <td className="px-5 py-4">{roleLabels[user.role]}</td>
                    <td className="px-5 py-4">
                      <span
                        className={user.status === 'active' ? 'text-emerald-700' : 'text-rose-700'}
                      >
                        {user.status === 'active' ? 'Active' : 'Blocked'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-neutral-500">
                      {date.format(new Date(user.createdAt))}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setSelected(user)}
                          className="icon-button"
                          aria-label={`View ${user.fullName}`}
                        >
                          <FiEye />
                        </button>
                        <button
                          disabled={user.role === 'master'}
                          onClick={() => {
                            void management
                              .toggleStatus(user)
                              .then(() =>
                                setFeedback(
                                  user.status === 'active'
                                    ? 'User account blocked.'
                                    : 'User account unblocked.'
                                )
                              )
                              .catch((cause) =>
                                setFeedback(
                                  cause instanceof Error
                                    ? cause.message
                                    : 'Unable to change access.'
                                )
                              )
                          }}
                          className="secondary-button text-xs disabled:opacity-40"
                        >
                          {user.status === 'active' ? 'Block' : 'Unblock'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!management.isLoading && filtered.length === 0 && (
              <p className="p-10 text-center text-sm text-neutral-500">
                No accounts match the filters.
              </p>
            )}
            {management.isLoading && (
              <p className="p-10 text-center text-sm text-neutral-500">Loading accounts…</p>
            )}
          </div>
        </section>
      </div>
      {creating && (
        <CreateUserDialog
          close={() => setCreating(false)}
          save={async (values) => {
            await management.saveUser(values)
            setCreating(false)
            setFeedback('User account created.')
          }}
        />
      )}
      {selected && <UserDetails user={selected} close={() => setSelected(null)} />}
    </DashboardShell>
  )
}

function CreateUserDialog({
  close,
  save
}: {
  close: VoidFunction
  save: (values: UserFormValues) => Promise<void>
}): ReactElement {
  const [values, setValues] = useState<UserFormValues>({
    fullName: '',
    username: '',
    role: 'manager',
    password: ''
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await save({
        ...values,
        fullName: values.fullName.trim(),
        username: values.username.trim().toLowerCase()
      })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create the account.')
      setSaving(false)
    }
  }
  return (
    <Dialog title="Create user account" close={close}>
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <Field label="Full name">
          <input
            required
            minLength={2}
            className="field"
            value={values.fullName}
            onChange={(event) => setValues({ ...values, fullName: event.target.value })}
          />
        </Field>
        <Field label="Username">
          <input
            required
            minLength={4}
            autoComplete="username"
            className="field"
            value={values.username}
            onChange={(event) => setValues({ ...values, username: event.target.value })}
          />
        </Field>
        <Field label="Role">
          <select disabled className="field" value="manager">
            <option value="manager">Manager</option>
          </select>
        </Field>
        <Field label="Temporary password">
          <input
            required
            minLength={8}
            type="password"
            autoComplete="new-password"
            className="field"
            value={values.password}
            onChange={(event) => setValues({ ...values, password: event.target.value })}
          />
        </Field>
        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={close} className="secondary-button">
            Cancel
          </button>
          <button disabled={saving} className="primary-button">
            {saving ? 'Creating…' : 'Create account'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function UserDetails({ user, close }: { user: ManagedUser; close: VoidFunction }): ReactElement {
  return (
    <Dialog title={user.fullName} close={close}>
      <dl className="grid gap-4 sm:grid-cols-2">
        <Detail label="Username" value={`@${user.username}`} />
        <Detail label="Role" value={roleLabels[user.role]} />
        <Detail label="Status" value={user.status === 'active' ? 'Active' : 'Blocked'} />
        <Detail label="Verification" value={user.verified ? 'Verified' : 'Unverified'} />
      </dl>
    </Dialog>
  )
}

function Dialog({
  title,
  close,
  children
}: {
  title: string
  close: VoidFunction
  children: ReactElement
}): ReactElement {
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-neutral-950/55 p-4 backdrop-blur-sm">
      <button className="absolute inset-0" aria-label="Close dialog" onClick={close} />
      <section
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button onClick={close} className="icon-button" aria-label="Close dialog">
            <FiX />
          </button>
        </div>
        {children}
      </section>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactElement }): ReactElement {
  return (
    <label className="block text-sm font-medium text-neutral-700">
      {label}
      {children}
    </label>
  )
}

function Detail({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div>
      <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  )
}

function Metric({
  label,
  value,
  icon
}: {
  label: string
  value: number
  icon: ReactElement
}): ReactElement {
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">{label}</p>
        <span className="text-mauve-600">{icon}</span>
      </div>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </div>
  )
}
