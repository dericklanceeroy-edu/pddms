import { RESTORE_NOTICE_KEY } from '@renderer/data/restoreNotice'
import { channels } from '@shared/constants'
import type { AuditRecord, BackupInfo } from '@shared/security'
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { FiCheck, FiMinus } from 'react-icons/fi'

/** Plain names for the permission areas, in the order an administrator thinks about them. */
const areaLabels: Record<string, string> = {
  sale: 'Sales & Dispensing',
  customer: 'Customers',
  product: 'Inventory Products',
  inventoryAdjustment: 'Stock Adjustments',
  supplier: 'Suppliers',
  purchaseOrder: 'Purchase Orders',
  wholesale: 'Wholesale Orders',
  receivable: 'Accounts Receivable',
  report: 'Reports',
  account: 'User Accounts',
  administration: 'Backups & Activity Log'
}
/** Activity log areas come from the first part of each action, e.g. "sales.checkout". */
const logAreaLabels: Record<string, string> = {
  ...areaLabels,
  account: 'User Accounts',
  administration: 'Backups & Activity Log',
  auth: 'Sign In & Sign Out',
  dashboard: 'Dashboard',
  inventory: 'Inventory & Expiry',
  procurement: 'Invoices & Payments',
  reporting: 'Reports',
  sales: 'Sales & Dispensing',
  setup: 'First-Time Setup'
}
const logArea = (resource: string): string => logAreaLabels[resource] ?? resource
const actionLabels: Record<string, string> = {
  read: 'View',
  create: 'Create',
  update: 'Edit',
  delete: 'Delete'
}
const roleOrder = ['master', 'staff', 'cashier']
const roleNames: Record<string, string> = { master: 'Master', staff: 'Staff', cashier: 'Cashier' }
const resultOptions = ['success', 'failed', 'denied', 'started', 'cancelled'] as const
interface LogFilter {
  search: string
  from: string
  to: string
  result: string
  resource: string
}
const emptyLogFilter: LogFilter = { search: '', from: '', to: '', result: '', resource: '' }
/** Drops empty filter values so the request only carries what was chosen. */
const logPayload = (filter: LogFilter, beforeId?: number): Record<string, unknown> => ({
  search: filter.search.trim(),
  ...(filter.from ? { from: filter.from } : {}),
  ...(filter.to ? { to: filter.to } : {}),
  ...(filter.result ? { result: filter.result } : {}),
  ...(filter.resource ? { resource: filter.resource } : {}),
  ...(beforeId ? { beforeId } : {})
})
/** "View · Create · Edit (own only)" for one role and area. */
function grantedActions(actions: Record<string, string[]> | undefined): string[] {
  if (!actions) return []
  const result = new Map<string, boolean>()
  for (const key of Object.keys(actions)) {
    const [action, possession] = key.split(':')
    const own = possession === 'own'
    result.set(action, (result.get(action) ?? true) && own)
  }
  return Object.keys(actionLabels)
    .filter((action) => result.has(action))
    .map((action) => `${actionLabels[action]}${result.get(action) ? ' (own)' : ''}`)
}

type Grants = Record<string, Record<string, Record<string, string[]>>>
interface Result {
  success: boolean
  error?: string
  records?: AuditRecord[]
  backups?: BackupInfo[]
  backup?: BackupInfo
  safety?: BackupInfo
  grants?: Grants
  resources?: string[]
  cancelled?: boolean
  reloadRequired?: boolean
}
async function request(channel: string, payload?: unknown): Promise<Result> {
  const result = (await window.electron.ipcRenderer.invoke(channel, payload)) as Result
  if (!result.success) throw new Error(result.error ?? 'Administration request failed.')
  return result
}
export default function AdministrationTools(): ReactElement {
  const [logs, setLogs] = useState<AuditRecord[]>([])
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [grants, setGrants] = useState<Grants>({})
  const [logFilter, setLogFilter] = useState<LogFilter>(emptyLogFilter)
  const [loadedFilter, setLoadedFilter] = useState<LogFilter>(emptyLogFilter)
  const [logResources, setLogResources] = useState<string[]>([])
  const [logError, setLogError] = useState('')
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [more, setMore] = useState(false)
  useEffect(() => {
    let active = true
    void Promise.all([
      request(channels.administration.logs, { search: '' }),
      request(channels.administration.backups),
      request(channels.administration.permissions)
    ])
      .then(([history, copies, permissions]) => {
        if (active) {
          setLogs(history.records ?? [])
          setLogResources(history.resources ?? [])
          setMore(history.records?.length === 100)
          setBackups(copies.backups ?? [])
          setGrants(permissions.grants ?? {})
        }
      })
      .catch((cause) => {
        if (active)
          setError(cause instanceof Error ? cause.message : 'Unable to load administration tools.')
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [])
  const run = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Operation failed.')
    } finally {
      setBusy(false)
    }
  }
  // Note: The activity list follows the filters as they change; typing is debounced so each
  // keystroke does not start a database query.
  const firstFilter = useRef(true)
  const rangeError =
    logFilter.from && logFilter.to && logFilter.from > logFilter.to
      ? 'The “From” date must be on or before the “To” date.'
      : ''
  useEffect(() => {
    if (firstFilter.current) {
      firstFilter.current = false
      return
    }
    if (rangeError) return
    let active = true
    const timer = window.setTimeout(() => {
      setLogError('')
      void request(channels.administration.logs, logPayload(logFilter))
        .then((result) => {
          if (!active) return
          setLogs(result.records ?? [])
          setMore(result.records?.length === 100)
          if (result.resources) setLogResources(result.resources)
          setLoadedFilter(logFilter)
        })
        .catch((cause) => {
          if (active)
            setLogError(cause instanceof Error ? cause.message : 'Unable to load activity.')
        })
    }, 300)
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [logFilter, rangeError])
  const filtersActive = Object.values(logFilter).some(Boolean)
  const roles = roleOrder.filter((role) => grants[role])
  const areas = Object.keys(areaLabels).filter((area) => roles.some((role) => grants[role]?.[area]))
  return (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="status-message border-rose-200 bg-rose-50 text-rose-800">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-md bg-emerald-50 p-4 break-words text-emerald-800">
          {message}
        </p>
      )}
      <section className="panel space-y-4 p-5 sm:p-6">
        <div>
          <h3 className="section-title">Role Permissions</h3>
          <p className="section-subtitle">
            What each role can do in each area. To change someone’s access, edit the user and pick
            another role. The Master role is created during setup and cannot be assigned.
          </p>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="data-table w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr>
                <th scope="col" className="w-1/4 px-4 py-3">
                  Area
                </th>
                {roles.map((role) => (
                  <th scope="col" className="px-4 py-3" key={role}>
                    {roleNames[role] ?? role}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {areas.map((area) => (
                <tr key={area}>
                  <th scope="row" className="px-4 py-3 font-semibold text-slate-800">
                    {areaLabels[area]}
                  </th>
                  {roles.map((role) => {
                    const actions = grantedActions(grants[role]?.[area])
                    return (
                      <td className="px-4 py-3 align-top" key={role}>
                        {actions.length ? (
                          <ul className="flex flex-wrap gap-1.5">
                            {actions.map((action) => (
                              <li
                                key={action}
                                className="border-brand-200 bg-brand-50 text-brand-800 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold"
                              >
                                <FiCheck aria-hidden="true" /> {action}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                            <FiMinus aria-hidden="true" /> No Access
                          </span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">
          “Own” means the role sees only its own records, for example a cashier’s own sales.
        </p>
      </section>
      <section className="panel space-y-4 p-5 sm:p-6">
        <div>
          <h3 className="section-title">Backups &amp; Restore</h3>
          <p className="section-subtitle">
            A backup holds a consistent copy of the database and the supplier invoice files it
            refers to. Keep the whole backup folder and store it securely; files are not encrypted.
            Restoring signs everyone out. Backups from earlier versions of Med Prix are upgraded
            during restore.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="primary-button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await request(channels.administration.backup)
                if (result.backup) {
                  setMessage(`Backup saved: ${result.backup.directory}`)
                  setBackups([result.backup, ...backups])
                }
              })
            }
          >
            Create Backup…
          </button>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await request(channels.administration.restore)
                if (result.reloadRequired) {
                  // Note: No native alert here. An alert closing on Windows left the sign-in
                  // fields unable to take keyboard input; the result is shown on the sign-in page.
                  try {
                    window.sessionStorage.setItem(
                      RESTORE_NOTICE_KEY,
                      `Backup restored. A safety copy of the data before the restore was saved to ${result.safety?.directory ?? 'the backups folder'}. Sign in with an account from the restored backup.`
                    )
                  } catch {
                    /* Note: The notice is optional; signing in works without it. */
                  }
                  window.location.hash = '#/signIn'
                  window.location.reload()
                }
              })
            }
          >
            Restore From Backup…
          </button>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() =>
              void run(async () =>
                setBackups((await request(channels.administration.backups)).backups ?? [])
              )
            }
          >
            Refresh Backup List
          </button>
        </div>
        <p className="text-xs text-slate-500">
          The list shows the default local backup folder and backups created in this session.
          Backups saved elsewhere can be chosen through Restore From Backup.
        </p>
        <div className="max-h-48 space-y-2 overflow-auto">
          {backups.map((backup) => (
            <p
              className="rounded-lg border border-slate-200 p-3 text-sm break-all"
              key={backup.directory}
            >
              <span className="font-semibold">{new Date(backup.createdAt).toLocaleString()}</span> ·{' '}
              {backup.invoiceCount} invoices
              <br />
              <span className="text-slate-500">{backup.directory}</span>
            </p>
          ))}
        </div>
        {!backups.length && (
          <p className="text-sm text-slate-500">No completed local backups found.</p>
        )}
      </section>
      <section className="panel space-y-4 p-5 sm:p-6">
        <div>
          <h3 className="section-title">System Activity Log</h3>
          <p className="section-subtitle">
            Security events and important saved operations. Passwords and raw request data are never
            logged. A “started” entry without a final result may mean the operation was interrupted.
          </p>
        </div>
        <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto] xl:items-end">
          <label className="block text-sm font-medium text-slate-700">
            Search
            <input
              className="field mt-1.5"
              maxLength={100}
              value={logFilter.search}
              onChange={(event) => setLogFilter({ ...logFilter, search: event.target.value })}
              placeholder="Account, action or result"
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            From
            <input
              className="field mt-1.5"
              type="date"
              value={logFilter.from}
              max={logFilter.to || undefined}
              onChange={(event) => setLogFilter({ ...logFilter, from: event.target.value })}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            To
            <input
              className="field mt-1.5"
              type="date"
              value={logFilter.to}
              min={logFilter.from || undefined}
              onChange={(event) => setLogFilter({ ...logFilter, to: event.target.value })}
            />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Result
            <select
              className="field mt-1.5"
              value={logFilter.result}
              onChange={(event) => setLogFilter({ ...logFilter, result: event.target.value })}
            >
              <option value="">All Results</option>
              {resultOptions.map((result) => (
                <option key={result} value={result}>
                  {result[0].toUpperCase() + result.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Area
            <select
              className="field mt-1.5"
              value={logFilter.resource}
              onChange={(event) => setLogFilter({ ...logFilter, resource: event.target.value })}
            >
              <option value="">All Areas</option>
              {logResources.map((resource) => (
                <option key={resource} value={resource}>
                  {logArea(resource)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="secondary-button"
            disabled={!filtersActive}
            onClick={() => setLogFilter(emptyLogFilter)}
          >
            Clear Filters
          </button>
        </div>
        {(rangeError || logError) && (
          <p role="alert" className="text-sm font-medium text-rose-700">
            {rangeError || logError}
          </p>
        )}
        {busy && <p role="status">Loading…</p>}
        <div className="max-h-[55vh] overflow-auto rounded-lg border border-slate-200">
          <table className="data-table w-full min-w-[720px] text-left text-sm">
            <thead className="sticky top-0">
              <tr>
                {['Time', 'Account', 'Action', 'Area', 'Target ID', 'Result'].map((label) => (
                  <th className="px-3 py-2.5" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5">
                    {log.actorId === null ? (
                      <span className="text-slate-500">Not signed in</span>
                    ) : (
                      log.actorName
                    )}
                  </td>
                  <td className="px-3 py-2.5">{log.action}</td>
                  <td className="px-3 py-2.5">{logArea(log.resource)}</td>
                  <td className="px-3 py-2.5">{log.targetId ?? '—'}</td>
                  <td className="px-3 py-2.5">
                    <ResultBadge result={log.result} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!busy && !logs.length && (
          <p className="text-sm text-slate-500">
            {filtersActive ? 'No activity matches these filters.' : 'No activity recorded yet.'}
          </p>
        )}
        {more && (
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await request(
                  channels.administration.logs,
                  logPayload(loadedFilter, logs.at(-1)?.id)
                )
                setLogs([...logs, ...(result.records ?? [])])
                setMore(result.records?.length === 100)
              })
            }
          >
            Load Older Activity
          </button>
        )}
      </section>
    </div>
  )
}

/** Result with a word and a colour, so the colour is never the only signal. */
function ResultBadge({ result }: { result: string }): ReactElement {
  const tone =
    result === 'success'
      ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
      : result === 'denied' || result === 'failed'
        ? 'bg-rose-50 text-rose-800 ring-rose-200'
        : 'bg-amber-50 text-amber-800 ring-amber-200'
  return (
    <span className={`status-badge ring-1 ${tone}`}>
      {result[0]?.toUpperCase()}
      {result.slice(1)}
    </span>
  )
}
