import { useProfileStore } from '@renderer/stores/useProfileStore'
import { channels } from '@shared/constants'
import type { AuditRecord, BackupInfo } from '@shared/security'
import { useEffect, useState, type ReactElement } from 'react'

type Grants = Record<string, Record<string, Record<string, string[]>>>
interface Result {
  success: boolean
  error?: string
  records?: AuditRecord[]
  backups?: BackupInfo[]
  backup?: BackupInfo
  safety?: BackupInfo
  grants?: Grants
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
  const [search, setSearch] = useState('')
  const [loadedSearch, setLoadedSearch] = useState('')
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
  return (
    <div className="space-y-5">
      {error && (
        <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="rounded-xl bg-emerald-50 p-4 break-words text-emerald-800">
          {message}
        </p>
      )}
      <section className="panel space-y-3 p-5">
        <h3 className="text-lg font-semibold">Role permissions</h3>
        <p className="text-sm text-neutral-500">
          Permissions come from existing AccessControl roles. Assign Staff/Cashier in Edit user to
          change access. The setup-only Master role is protected. No separate individual permission
          overrides are used.
        </p>
        <div className="max-h-64 overflow-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr>
                <th className="p-2">Role</th>
                <th className="p-2">Resource</th>
                <th className="p-2">Granted actions</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(grants).flatMap(([role, resources]) =>
                Object.entries(resources).map(([resource, actions]) => (
                  <tr key={`${role}-${resource}`} className="border-t border-neutral-100">
                    <td className="p-2">{role}</td>
                    <td className="p-2">{resource}</td>
                    <td className="p-2">{Object.keys(actions).join(', ')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
      <section className="panel space-y-3 p-5">
        <h3 className="text-lg font-semibold">Backups & restore</h3>
        <p className="text-sm text-neutral-500">
          Local backups contain a consistent SQLite snapshot and referenced supplier invoice files.
          Keep the entire backup folder. Files are not encrypted; store them securely. Restore
          requires a compatible schema and signs everyone out.
        </p>
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
            Create backup…
          </button>
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await request(channels.administration.restore)
                if (result.reloadRequired) {
                  window.alert(
                    `Restore complete. Safety backup: ${result.safety?.directory}. Sign in using credentials from the restored backup.`
                  )
                  useProfileStore.getState().reset()
                  window.location.reload()
                }
              })
            }
          >
            Restore from backup…
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
            Refresh local backup list
          </button>
        </div>
        <p className="text-xs text-neutral-500">
          The list shows the default local backup folder and backups created in this session.
          External backups can be selected through Restore.
        </p>
        <div className="max-h-48 space-y-2 overflow-auto">
          {backups.map((backup) => (
            <p
              className="rounded-lg border border-neutral-200 p-3 text-sm break-all"
              key={backup.directory}
            >
              {new Date(backup.createdAt).toLocaleString()} · {backup.invoiceCount} invoices
              <br />
              {backup.directory}
            </p>
          ))}
        </div>
        {!backups.length && (
          <p className="text-sm text-neutral-500">No completed local backups found.</p>
        )}
      </section>
      <section className="panel space-y-3 p-5">
        <h3 className="text-lg font-semibold">System activity log</h3>
        <p className="text-sm text-neutral-500">
          Security events and important saved operations. Passwords and raw request payloads are
          never logged. A “started” entry without a final result may indicate an interrupted
          operation.
        </p>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void run(async () => {
              const result = await request(channels.administration.logs, { search })
              setLogs(result.records ?? [])
              setMore(result.records?.length === 100)
              setLoadedSearch(search)
            })
          }}
        >
          <input
            className="field min-w-0 flex-1"
            aria-label="Search audit logs"
            maxLength={100}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Account, action or result"
          />
          <button className="secondary-button" disabled={busy}>
            Search / refresh
          </button>
        </form>
        {busy && <p role="status">Loading…</p>}
        <div className="max-h-[55vh] overflow-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr>
                {['Time', 'Account', 'Action', 'Resource', 'Target ID', 'Result'].map((label) => (
                  <th className="p-3" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr className="border-t border-neutral-100" key={log.id}>
                  <td className="p-3">{new Date(log.createdAt).toLocaleString()}</td>
                  <td className="p-3">{log.actorName}</td>
                  <td className="p-3">{log.action}</td>
                  <td className="p-3">{log.resource}</td>
                  <td className="p-3">{log.targetId ?? '—'}</td>
                  <td className="p-3">{log.result}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!busy && !logs.length && <p>No matching activity.</p>}
        {more && (
          <button
            className="secondary-button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await request(channels.administration.logs, {
                  search: loadedSearch,
                  beforeId: logs.at(-1)?.id
                })
                setLogs([...logs, ...(result.records ?? [])])
                setMore(result.records?.length === 100)
              })
            }
          >
            Older activity
          </button>
        )}
      </section>
    </div>
  )
}
