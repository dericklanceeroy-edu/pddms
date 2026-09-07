import DashboardShell from '@renderer/components/dashboard/DashboardShell'
import {
  roleLabels,
  type ManagedUser,
  type UserFormValues,
  type UserRole,
  type UserUpdateValues
} from '@renderer/data/userManagement'
import { useUserManagement } from '@renderer/hooks/useUserManagement'
import { useMemo, useState, type FormEvent, type ReactElement } from 'react'
import { FiEdit2, FiPlus, FiSearch, FiShield, FiTrash2, FiUsers, FiX } from 'react-icons/fi'

const date = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' })

const roleTone: Record<UserRole, string> = {
  master: 'border-mauve-200 bg-mauve-50 text-mauve-800',
  staff: 'border-indigo-200 bg-indigo-50 text-indigo-800',
  cashier: 'border-sky-200 bg-sky-50 text-sky-800'
}

export default function UserManagement(): ReactElement {
  const management = useUserManagement()
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<UserRole | 'all'>('all')
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<ManagedUser | null>(null)
  const [selected, setSelected] = useState<ManagedUser | null>(null)
  const [deleteUser, setDeleteUser] = useState<ManagedUser | null>(null)
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
      <div className="space-y-5 lg:space-y-6">
        <section className="page-intro p-6 sm:p-7">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-20 right-0 size-64 rounded-full bg-indigo-400/20 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute right-1/4 -bottom-24 size-52 rounded-full bg-mauve-400/15 blur-3xl"
          />
          <div className="page-intro-content flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p className="eyebrow">System administration</p>
              <h2 className="mt-1 text-3xl font-semibold tracking-tight text-neutral-950 sm:text-[2rem]">
                User accounts
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-600">
                Create, find, inspect, block, and unblock verified system users.
              </p>
            </div>
            <div className="flex flex-col items-start gap-3 sm:items-end">
              <p className="rounded-full border border-white/80 bg-white/55 px-3 py-1.5 text-xs font-medium text-neutral-500 shadow-sm backdrop-blur-md">
                Access control workspace
              </p>
              <button onClick={() => setCreating(true)} className="primary-button">
                <FiPlus /> Create user
              </button>
            </div>
          </div>
        </section>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
            className={`rounded-2xl border px-4 py-3 text-sm shadow-sm backdrop-blur-md ${management.error ? 'border-rose-200/80 bg-rose-50/75 text-rose-700' : 'border-emerald-200/80 bg-emerald-50/75 text-emerald-800'}`}
          >
            {management.error || feedback}
          </p>
        )}
        <section className="table-surface">
          <div className="surface-header flex flex-col gap-3 p-4 sm:flex-row sm:p-5">
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
              <option value="staff">Staff</option>
              <option value="cashier">Cashier</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="surface-header text-left text-neutral-500">
                <tr>
                  <th className="px-5 py-3">User</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Created</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100/90">
                {filtered.map((user) => (
                  <tr
                    key={user.id}
                    tabIndex={0}
                    role="button"
                    aria-label={`View ${user.fullName}`}
                    onClick={() => setSelected(user)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        setSelected(user)
                      }
                    }}
                    className="cursor-pointer transition-colors hover:bg-mauve-50/50 focus-visible:bg-mauve-50/50 focus-visible:ring-2 focus-visible:ring-mauve-500 focus-visible:outline-none focus-visible:ring-inset"
                  >
                    <td className="px-5 py-4">
                      <p className="font-semibold">{user.fullName}</p>
                      <p className="text-xs text-neutral-500">@{user.username}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${roleTone[user.role]}`}
                      >
                        {roleLabels[user.role]}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${user.status === 'active' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-700'}`}
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
                          disabled={user.role === 'master'}
                          onClick={(event) => {
                            event.stopPropagation()
                            setEditing(user)
                          }}
                          onKeyDown={(event) => event.stopPropagation()}
                          className={'icon-button text-mauve-700 disabled:opacity-40'}
                          aria-label={'Edit user'}
                        >
                          <FiEdit2 />
                        </button>
                        <button
                          disabled={user.role === 'master'}
                          onClick={(event) => {
                            event.stopPropagation()
                            setDeleteUser(user)
                          }}
                          onKeyDown={(event) => event.stopPropagation()}
                          className={'icon-button text-rose-700 disabled:opacity-40'}
                          aria-label={`Delete ${user.fullName}`}
                        >
                          <FiTrash2 />
                        </button>
                        <button
                          disabled={user.role === 'master'}
                          onClick={(event) => {
                            event.stopPropagation()
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
                          onKeyDown={(event) => event.stopPropagation()}
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
      {editing && (
        <EditUserDialog
          user={editing}
          close={() => setEditing(null)}
          save={async (values) => {
            await management.updateUser(editing, values)
            setEditing(null)
            setSelected(null)
            setFeedback('User account updated.')
          }}
        />
      )}
      {selected && <UserDetails user={selected} close={() => setSelected(null)} />}
      {deleteUser && (
        <DeleteUserDialog
          user={deleteUser}
          close={() => setDeleteUser(null)}
          confirm={async () => {
            await management.deleteUser(deleteUser)
            setDeleteUser(null)
            setFeedback('User account deleted.')
          }}
        />
      )}
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
    role: 'staff',
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
      <form noValidate onSubmit={(event) => void submit(event)} className="space-y-4">
        <Field label="Full name">
          <input
            required
            minLength={2}
            className="field"
            placeholder={'e.g. Juan Dela Cruz'}
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
            maxLength={32}
            placeholder={'e.g. juan.delacruz'}
            value={values.username}
            onChange={(event) => setValues({ ...values, username: event.target.value })}
          />
        </Field>
        <Field label="Role">
          <select
            className="field"
            value={values.role}
            onChange={(event) => setValues({ ...values, role: event.target.value as UserRole })}
          >
            {(Object.keys(roleLabels) as UserRole[])
              .filter((role) => role !== 'master')
              .map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Temporary password">
          <input
            required
            minLength={8}
            type="password"
            autoComplete="new-password"
            className="field"
            placeholder={'At least 8 characters'}
            value={values.password}
            onChange={(event) => setValues({ ...values, password: event.target.value })}
          />
        </Field>
        {error && (
          <p
            role="alert"
            className="rounded-2xl border border-rose-200/80 bg-rose-50/75 p-3 text-sm text-rose-700"
          >
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

function EditUserDialog({
  user,
  close,
  save
}: {
  user: ManagedUser
  close: VoidFunction
  save: (values: UserUpdateValues) => Promise<void>
}): ReactElement {
  const [values, setValues] = useState<UserUpdateValues>({
    fullName: user.fullName,
    username: user.username,
    role: user.role,
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
      setError(cause instanceof Error ? cause.message : 'Unable to update the account.')
      setSaving(false)
    }
  }

  return (
    <Dialog title={'Edit user account'} close={close}>
      <form noValidate onSubmit={(event) => void submit(event)} className={'space-y-4'}>
        <Field label={'Full name'}>
          <input
            required
            minLength={2}
            className={'field'}
            placeholder={'e.g. Juan Dela Cruz'}
            value={values.fullName}
            onChange={(event) => setValues({ ...values, fullName: event.target.value })}
          />
        </Field>
        <Field label={'Username'}>
          <input
            required
            minLength={4}
            maxLength={32}
            autoComplete={'username'}
            className={'field'}
            placeholder={'e.g. juan.delacruz'}
            value={values.username}
            onChange={(event) => setValues({ ...values, username: event.target.value })}
          />
        </Field>
        <Field label={'Role'}>
          <select
            className={'field'}
            value={values.role}
            onChange={(event) => setValues({ ...values, role: event.target.value as UserRole })}
          >
            <option value={'staff'}>{roleLabels.staff}</option>
            <option value={'cashier'}>{roleLabels.cashier}</option>
          </select>
        </Field>
        <Field label={'New password (optional)'}>
          <input
            minLength={8}
            type={'password'}
            autoComplete={'new-password'}
            className={'field'}
            placeholder={'Leave blank to keep the current password'}
            value={values.password}
            onChange={(event) => setValues({ ...values, password: event.target.value })}
          />
        </Field>
        {error && (
          <p
            role={'alert'}
            className={
              'rounded-2xl border border-rose-200/80 bg-rose-50/75 p-3 text-sm text-rose-700'
            }
          >
            {error}
          </p>
        )}
        <div className={'flex justify-end gap-2 pt-2'}>
          <button type={'button'} onClick={close} className={'secondary-button'}>
            Cancel
          </button>
          <button disabled={saving} className={'primary-button'}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

function DeleteUserDialog({
  user,
  close,
  confirm
}: {
  user: ManagedUser
  close: VoidFunction
  confirm: () => Promise<void>
}): ReactElement {
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)

  const remove = async (): Promise<void> => {
    setDeleting(true)
    setError('')
    try {
      await confirm()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to delete the account.')
      setDeleting(false)
    }
  }

  return (
    <Dialog title="Delete staff account?" close={close}>
      <div>
        <p className="text-sm leading-6 text-neutral-600">
          {user.fullName} will permanently lose access and be removed from the user list.
        </p>
        {error && (
          <p
            role="alert"
            className="mt-4 rounded-2xl border border-rose-200/80 bg-rose-50/75 p-3 text-sm text-rose-700"
          >
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button disabled={deleting} onClick={close} className="secondary-button">
            Cancel
          </button>
          <button
            disabled={deleting}
            onClick={() => void remove()}
            className="danger-button disabled:opacity-60"
          >
            {deleting ? 'Deleting…' : 'Delete account'}
          </button>
        </div>
      </div>
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
    <div className="bg-ink-950/55 fixed inset-0 z-[70] grid place-items-center p-4 backdrop-blur-md">
      <button className="absolute inset-0" aria-label="Close dialog" onClick={close} />
      <section
        role="dialog"
        aria-modal="true"
        className="glass-surface relative z-10 w-full max-w-lg rounded-[2rem] border-white/80 p-5 sm:p-6"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-20 right-0 size-44 rounded-full bg-mauve-300/30 blur-3xl"
        />
        <div className="relative mb-5 flex items-center justify-between">
          <h2 className="text-xl font-semibold tracking-tight text-neutral-950">{title}</h2>
          <button onClick={close} className="icon-button" aria-label="Close dialog">
            <FiX />
          </button>
        </div>
        <div className="relative">{children}</div>
      </section>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactElement }): ReactElement {
  return (
    <label className="block text-sm font-medium text-neutral-700">
      {label}
      <span className="mt-1.5 block">{children}</span>
    </label>
  )
}

function Detail({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="rounded-2xl border border-neutral-200/80 bg-white/70 p-3">
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
    <div className="relative overflow-hidden rounded-[1.5rem] border border-neutral-200/80 bg-white/85 p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div
        aria-hidden="true"
        className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-mauve-300/0 via-mauve-300/90 to-indigo-300/0"
      />
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">{label}</p>
        <span className="grid size-10 place-items-center rounded-2xl bg-mauve-50 text-mauve-700">
          {icon}
        </span>
      </div>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </div>
  )
}
