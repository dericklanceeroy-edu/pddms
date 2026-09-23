import DashboardShell from '@renderer/components/dashboard/DashboardShell'
import { exportReport, getReport } from '@renderer/services/reporting'
import { localDate } from '@shared/inventory'
import {
  reportTitles,
  type BusinessReport,
  type ReportColumn,
  type ReportFilter,
  type ReportKind,
  type ReportRow
} from '@shared/reporting'
import { money } from '@shared/sales'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState, type ReactElement } from 'react'

const initialFilter = (): ReportFilter => ({
  kind: 'sales',
  from: localDate(),
  to: localDate(),
  search: '',
  page: 1
})
export function ReportTable({ report }: { report: BusinessReport }): ReactElement {
  const cell = (row: ReportRow, column: ReportColumn): ReactElement | string | number => {
    const value = row[column.key]
    if (value === null || value === undefined) return '—'
    if (column.productLink && row.productId && !row.isArchived)
      return (
        <Link
          className="text-mauve-700 underline"
          to="/items/$itemId"
          params={{ itemId: String(row.productId) }}
        >
          {value}
        </Link>
      )
    if (column.format === 'money') return money(Number(value))
    if (column.format === 'dateTime') return new Date(String(value)).toLocaleString()
    return value
  }
  return (
    <div className="max-h-[65vh] overflow-auto" tabIndex={0} aria-label="Report details">
      <table className="w-full min-w-[800px] text-left text-sm">
        <thead className="sticky top-0 z-10 bg-neutral-50">
          <tr>
            {report.columns.map((column) => (
              <th className="px-4 py-3 whitespace-nowrap" key={column.key}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.rows.map((row, index) => (
            <tr key={index} className="border-t border-neutral-100">
              {report.columns.map((column) => (
                <td className="max-w-96 min-w-32 px-4 py-3 align-top break-words" key={column.key}>
                  {cell(row, column)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!report.rows.length && (
        <p className="p-5 text-neutral-500">No matching records for this report.</p>
      )}
    </div>
  )
}
export default function ReportingWorkspace(): ReactElement {
  const [filter, setFilter] = useState(initialFilter)
  const [report, setReport] = useState<BusinessReport | null>(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const working = useRef(false)
  useEffect(() => {
    let active = true
    void getReport(initialFilter())
      .then((result) => {
        if (active) setReport(result)
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Unable to load report.')
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [])
  const run = async (action: () => Promise<void>): Promise<void> => {
    if (working.current) return
    working.current = true
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Report request failed.')
    } finally {
      working.current = false
      setBusy(false)
    }
  }
  const currentOnly = filter.kind === 'inventory' || filter.kind === 'overdue'
  return (
    <DashboardShell pageTitle="Business reports">
      <div className="space-y-5">
        <header className="page-intro p-5">
          <p className="eyebrow">Business reporting & management</p>
          <h2 className="text-2xl font-semibold">Reports</h2>
          <p className="mt-2 text-sm text-neutral-500">
            Live database reports. Choose the same start/end date for a daily report. Amounts are in
            Philippine pesos.
          </p>
        </header>
        <form
          className="panel space-y-4 p-5"
          onSubmit={(event) => {
            event.preventDefault()
            void run(async () => setReport(await getReport({ ...filter, page: 1 })))
          }}
        >
          <fieldset disabled={busy} className="grid items-end gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label>
              Report
              <select
                className="field"
                value={filter.kind}
                onChange={(event) =>
                  setFilter({ ...filter, kind: event.target.value as ReportKind, page: 1 })
                }
              >
                {Object.entries(reportTitles).map(([kind, title]) => (
                  <option value={kind} key={kind}>
                    {title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              From
              <input
                className="field"
                type="date"
                required
                disabled={currentOnly}
                value={filter.from}
                onChange={(event) => setFilter({ ...filter, from: event.target.value })}
              />
            </label>
            <label>
              Through
              <input
                className="field"
                type="date"
                required
                disabled={currentOnly}
                min={filter.from}
                value={filter.to}
                onChange={(event) => setFilter({ ...filter, to: event.target.value })}
              />
            </label>
            <label>
              Client, supplier, product or reference
              <input
                className="field"
                maxLength={120}
                disabled={filter.kind === 'financial'}
                value={filter.search}
                onChange={(event) => setFilter({ ...filter, search: event.target.value })}
                placeholder="Search relevant report fields"
              />
            </label>
            <button className="primary-button">{busy ? 'Generating…' : 'Generate report'}</button>
          </fieldset>
          {currentOnly && (
            <p className="text-sm text-neutral-500">
              This report shows current data across all dates.
            </p>
          )}
        </form>
        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-800">
            {notice}
          </p>
        )}
        {busy && <p role="status">Loading report data…</p>}
        {report && (
          <>
            <section className="panel space-y-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold">{report.title}</h3>
                  <p className="text-sm text-neutral-500">
                    Generated {new Date(report.generatedAt).toLocaleString()} ·{' '}
                    {['inventory', 'overdue'].includes(report.filter.kind)
                      ? 'Current snapshot'
                      : `${report.filter.from} through ${report.filter.to}`}{' '}
                    ·{' '}
                    {report.filter.search
                      ? `Search: ${report.filter.search}`
                      : 'All matching records'}
                  </p>
                </div>
                <button
                  className="secondary-button"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      if (await exportReport(report.filter))
                        setNotice(
                          'CSV exported with all matching rows and current database totals.'
                        )
                    })
                  }
                >
                  Export all matching rows (CSV)
                </button>
              </div>
              {report.notes.map((note) => (
                <p className="text-sm text-neutral-600" key={note}>
                  {note}
                </p>
              ))}
            </section>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {report.metrics.map((metric) => (
                <article className="panel p-4" key={metric.label}>
                  <p className="text-sm text-neutral-500">{metric.label}</p>
                  <p className="mt-2 text-xl font-semibold break-words">
                    {metric.format === 'money'
                      ? money(metric.value)
                      : metric.value.toLocaleString()}
                  </p>
                </article>
              ))}
            </div>
            <section className="panel min-w-0 overflow-hidden">
              <ReportTable report={report} />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 p-4">
                <p className="text-sm text-neutral-500">
                  {report.totalRows} matching rows · Page {report.filter.page} of{' '}
                  {Math.max(1, Math.ceil(report.totalRows / report.pageSize))} · Totals cover all
                  matching rows.
                </p>
                <div className="flex gap-2">
                  <button
                    className="secondary-button"
                    disabled={busy || report.filter.page <= 1}
                    onClick={() =>
                      void run(async () =>
                        setReport(
                          await getReport({ ...report.filter, page: report.filter.page - 1 })
                        )
                      )
                    }
                  >
                    Previous
                  </button>
                  <button
                    className="secondary-button"
                    disabled={busy || report.filter.page * report.pageSize >= report.totalRows}
                    onClick={() =>
                      void run(async () =>
                        setReport(
                          await getReport({ ...report.filter, page: report.filter.page + 1 })
                        )
                      )
                    }
                  >
                    Next
                  </button>
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </DashboardShell>
  )
}
