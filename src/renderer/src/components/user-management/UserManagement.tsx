import DashboardShell from '@renderer/components/dashboard/DashboardShell'
import {
  permissions,
  roleLabels,
  userRoles,
  type ManagedUser,
  type UserFormValues,
  type UserRole
} from '@renderer/data/userManagement'
import { useUserManagement } from '@renderer/hooks/useUserManagement'
import { useMemo, useState, type FormEvent, type ReactElement } from 'react'
import {
  FiActivity,
  FiCheck,
  FiDatabase,
  FiEdit2,
  FiPlus,
  FiSearch,
  FiShield,
  FiUserCheck,
  FiUsers,
  FiX
} from 'react-icons/fi'

type ManagementTab = 'users' | 'permissions' | 'activity' | 'data'

const tabs = [
  { id: 'users', label: 'User accounts', icon: FiUsers },
  { id: 'permissions', label: 'Roles & permissions', icon: FiShield },
  { id: 'activity', label: 'System history', icon: FiActivity },
  { id: 'data', label: 'Backup & restore', icon: FiDatabase }
] satisfies Array<{ id: ManagementTab; label: string; icon: typeof FiUsers }>

const dateFormatter = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' })

function UserDialog({
  user,
  usernames,
  close,
  save
}: {
  user: ManagedUser | null
  usernames: string[]
  close: VoidFunction
  save: (values: UserFormValues) => void
}): ReactElement {
  const [values, setValues] = useState<UserFormValues>({
    fullName: user?.fullName ?? '',
    username: user?.username ?? '',
    role: user?.role ?? 'cashier',
    password: ''
  })
  const [error, setError] = useState('')

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const fullName = values.fullName.trim()
    const username = values.username.trim().toLowerCase()

    if (fullName.length < 2 || username.length < 4) {
      setError('Enter a full name and a username with at least four characters.')
      return
    }
    if (!user && values.password.length < 8) {
      setError('New accounts require a password with at least eight characters.')
      return
    }
    if (usernames.some((value) => value !== user?.username && value === username)) {
      setError('That username is already assigned to another account.')
      return
    }
    save({ ...values, fullName, username })
  }

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-neutral-950/55 p-4 backdrop-blur-sm">
      <button className="absolute inset-0" aria-label="Close account dialog" onClick={close} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-dialog-title"
        className="relative z-10 w-full max-w-lg rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-neutral-200 px-6 py-5">
          <div>
            <p className="text-xs font-semibold tracking-wider text-mauve-700 uppercase">
              Account details
            </p>
            <h2 id="account-dialog-title" className="mt-1 text-xl font-semibold text-neutral-950">
              {user ? 'Edit user account' : 'Create user account'}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close account dialog"
            onClick={close}
            className="grid size-9 place-items-center rounded-lg text-neutral-500 hover:bg-neutral-100"
          >
            <FiX />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-5 p-6">
          <Field label="Full name">
            <input
              required
              value={values.fullName}
              onChange={(event) => setValues({ ...values, fullName: event.target.value })}
              className="field"
            />
          </Field>
          <Field label="Username">
            <input
              required
              value={values.username}
              onChange={(event) => setValues({ ...values, username: event.target.value })}
              className="field"
            />
          </Field>
          <Field label="Role">
            <select
              value={values.role}
              disabled={user?.role === 'admin'}
              onChange={(event) => setValues({ ...values, role: event.target.value as UserRole })}
              className="field bg-white disabled:bg-neutral-100"
            >
              {userRoles.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
          </Field>
          <Field label={user ? 'New password (optional)' : 'Temporary password'}>
            <input
              type="password"
              required={!user}
              minLength={user ? undefined : 8}
              value={values.password}
              onChange={(event) => setValues({ ...values, password: event.target.value })}
              className="field"
            />
          </Field>
          {error && (
            <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-3 border-t border-neutral-100 pt-5">
            <button
              type="button"
              onClick={close}
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-xl bg-mauve-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-mauve-700"
            >
              {user ? 'Save changes' : 'Create account'}
            </button>
          </div>
        </form>
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

export default function UserManagement(): ReactElement {
  const management = useUserManagement()
  const [activeTab, setActiveTab] = useState<ManagementTab>('users')
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all')
  const [dialogUser, setDialogUser] = useState<ManagedUser | null | undefined>()
  const [confirmRestore, setConfirmRestore] = useState(false)
  const filteredUsers = useMemo(() => {
    const search = query.trim().toLowerCase()
    return management.users.filter(
      (user) =>
        (roleFilter === 'all' || user.role === roleFilter) &&
        (!search || user.fullName.toLowerCase().includes(search) || user.username.includes(search))
    )
  }, [management.users, query, roleFilter])

  const save = (values: UserFormValues): void => {
    management.saveUser(values, dialogUser ?? null)
    setDialogUser(undefined)
  }

  return (
    <DashboardShell pageTitle="User management">
      <div className="space-y-6">
        <section className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="eyebrow">System administration</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              Users, access, and system data
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
              Control staff access, review administrative activity, and protect pharmacy records.
            </p>
          </div>
          <button onClick={() => setDialogUser(null)} className="primary-button">
            <FiPlus /> Create user
          </button>
        </section>
        <section className="grid gap-4 sm:grid-cols-3">
          <Metric label="Total accounts" value={management.users.length} icon={FiUsers} />
          <Metric
            label="Active accounts"
            value={management.users.filter((user) => user.status === 'active').length}
            icon={FiUserCheck}
          />
          <Metric
            label="Administrators"
            value={management.users.filter((user) => user.role === 'admin').length}
            icon={FiShield}
          />
        </section>
        <div className="overflow-x-auto border-b border-neutral-200">
          <div className="flex min-w-max gap-1">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium ${activeTab === id ? 'border-mauve-600 text-mauve-700' : 'border-transparent text-neutral-500 hover:text-neutral-900'}`}
              >
                <Icon /> {label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'users' && (
          <UsersTable
            users={filteredUsers}
            query={query}
            roleFilter={roleFilter}
            setQuery={setQuery}
            setRoleFilter={setRoleFilter}
            edit={setDialogUser}
            toggle={management.toggleStatus}
          />
        )}
        {activeTab === 'permissions' && <Permissions />}
        {activeTab === 'activity' && (
          <section className="panel">
            <PanelHeader
              title="System history"
              description="Account and operational events retained for administrative review."
            />
            <div className="divide-y divide-neutral-100">
              {management.logs.map((log) => (
                <article key={log.id} className="flex gap-4 p-5">
                  <span className="mt-1 size-2.5 shrink-0 rounded-full bg-mauve-500" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col justify-between gap-1 sm:flex-row">
                      <p className="font-medium">
                        {log.action}{' '}
                        <span className="font-normal text-neutral-500">by {log.actor}</span>
                      </p>
                      <time className="text-xs text-neutral-400">
                        {dateFormatter.format(new Date(log.createdAt))}
                      </time>
                    </div>
                    <p className="mt-1 text-sm text-neutral-500">{log.detail}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
        {activeTab === 'data' && (
          <DataProtection
            lastBackupAt={management.lastBackupAt}
            createBackup={management.createBackup}
            restore={() => {
              management.restoreBackup()
              setConfirmRestore(false)
            }}
            confirm={confirmRestore}
            setConfirm={setConfirmRestore}
          />
        )}
      </div>
      {dialogUser !== undefined && (
        <UserDialog
          user={dialogUser}
          usernames={management.users.map((user) => user.username)}
          close={() => setDialogUser(undefined)}
          save={save}
        />
      )}
    </DashboardShell>
  )
}

function Metric({
  label,
  value,
  icon: Icon
}: {
  label: string
  value: number
  icon: typeof FiUsers
}): ReactElement {
  return (
    <div className="panel p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-500">{label}</p>
        <Icon className="text-mauve-600" />
      </div>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </div>
  )
}

function PanelHeader({ title, description }: { title: string; description: string }): ReactElement {
  return (
    <div className="border-b border-neutral-200 p-5">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-neutral-500">{description}</p>
    </div>
  )
}

function UsersTable({
  users,
  query,
  roleFilter,
  setQuery,
  setRoleFilter,
  edit,
  toggle
}: {
  users: ManagedUser[]
  query: string
  roleFilter: UserRole | 'all'
  setQuery: (value: string) => void
  setRoleFilter: (value: UserRole | 'all') => void
  edit: (user: ManagedUser) => void
  toggle: (user: ManagedUser) => void
}): ReactElement {
  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search accounts</span>
          <FiSearch className="absolute top-3 left-3.5 text-neutral-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or username"
            className="field mt-0 pl-10"
          />
        </label>
        <select
          aria-label="Filter by role"
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value as UserRole | 'all')}
          className="rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-sm"
        >
          <option value="all">All roles</option>
          {userRoles.map((role) => (
            <option key={role} value={role}>
              {roleLabels[role]}
            </option>
          ))}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-neutral-50 text-xs tracking-wide text-neutral-500 uppercase">
            <tr>
              <th className="px-5 py-3">User</th>
              <th className="px-5 py-3">Role</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Last active</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-neutral-50">
                <td className="px-5 py-4">
                  <p className="font-medium">{user.fullName}</p>
                  <p className="text-xs text-neutral-500">@{user.username}</p>
                </td>
                <td className="px-5 py-4">
                  <span className="rounded-full bg-mauve-50 px-2.5 py-1 text-xs font-medium text-mauve-700">
                    {roleLabels[user.role]}
                  </span>
                </td>
                <td className="px-5 py-4">
                  <span
                    className={user.status === 'active' ? 'text-emerald-700' : 'text-neutral-500'}
                  >
                    ● {user.status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-5 py-4 text-neutral-500">
                  {user.lastActiveAt ? dateFormatter.format(new Date(user.lastActiveAt)) : 'Never'}
                </td>
                <td className="px-5 py-4">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => edit(user)}
                      aria-label={`Edit ${user.fullName}`}
                      className="icon-button"
                    >
                      <FiEdit2 />
                    </button>
                    <button
                      disabled={user.role === 'admin'}
                      onClick={() => toggle(user)}
                      className="secondary-button text-xs disabled:opacity-40"
                    >
                      {user.status === 'active' ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && (
          <p className="p-10 text-center text-sm text-neutral-500">
            No accounts match the selected filters.
          </p>
        )}
      </div>
    </section>
  )
}

function Permissions(): ReactElement {
  return (
    <section className="panel overflow-hidden">
      <PanelHeader
        title="Role access matrix"
        description="Default permissions follow least-privilege pharmacy workflows."
      />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="bg-neutral-50">
            <tr>
              <th className="px-5 py-3 text-left">Permission</th>
              {userRoles.map((role) => (
                <th key={role} className="px-5 py-3 text-center">
                  {roleLabels[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {permissions.map((permission) => (
              <tr key={permission.label}>
                <td className="px-5 py-4">
                  <p className="font-medium">{permission.label}</p>
                  <p className="mt-1 text-xs text-neutral-500">{permission.description}</p>
                </td>
                {userRoles.map((role) => (
                  <td key={role} className="px-5 py-4 text-center">
                    {permission.roles.includes(role) ? (
                      <FiCheck aria-label="Allowed" className="mx-auto text-emerald-600" />
                    ) : (
                      <span className="text-neutral-300">—</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function DataProtection({
  lastBackupAt,
  createBackup,
  restore,
  confirm,
  setConfirm
}: {
  lastBackupAt: string | null
  createBackup: VoidFunction
  restore: VoidFunction
  confirm: boolean
  setConfirm: (value: boolean) => void
}): ReactElement {
  return (
    <section className="grid gap-5 lg:grid-cols-2">
      <div className="panel p-6">
        <FiDatabase className="text-2xl text-emerald-600" />
        <h3 className="mt-5 font-semibold">Database backup</h3>
        <p className="mt-2 text-sm leading-6 text-neutral-500">
          Create a protected copy of accounts, inventory, sales, and supplier records.
        </p>
        <p className="mt-4 text-xs text-neutral-500">
          Last backup: {lastBackupAt ? dateFormatter.format(new Date(lastBackupAt)) : 'None'}
        </p>
        <button
          onClick={createBackup}
          className="primary-button mt-5 bg-neutral-950 hover:bg-neutral-800"
        >
          Create backup
        </button>
      </div>
      <div className="panel border-amber-200 p-6">
        <FiActivity className="text-2xl text-amber-600" />
        <h3 className="mt-5 font-semibold">Restore system data</h3>
        <p className="mt-2 text-sm leading-6 text-neutral-500">
          Restore the latest verified backup after confirmation.
        </p>
        {confirm ? (
          <div className="mt-5 rounded-xl bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-900">Confirm restoration request?</p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={restore}
                className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-semibold text-white"
              >
                Confirm restore
              </button>
              <button onClick={() => setConfirm(false)} className="px-3 py-2 text-xs">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirm(true)}
            className="secondary-button mt-5 border-amber-300 text-amber-800"
          >
            Restore latest backup
          </button>
        )}
      </div>
    </section>
  )
}
