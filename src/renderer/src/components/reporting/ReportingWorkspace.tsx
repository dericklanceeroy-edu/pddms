import DashboardShell from '@renderer/components/dashboard/DashboardShell'
import { exportReport, exportReportPdf, getReport } from '@renderer/services/reporting'
import { localDate } from '@shared/inventory'
import {
  reportTitles,
  titleCase,
  type BusinessReport,
  type ReportColumn,
  type ReportFilter,
  type ReportKind,
  type ReportRow
} from '@shared/reporting'
import { money } from '@shared/sales'
import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { FiDownload, FiFileText, FiPackage } from 'react-icons/fi'

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
          className="text-brand-700 underline"
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
        <thead className="sticky top-0 z-10 bg-slate-50">
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
            <tr key={index} className="border-t border-slate-100">
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
        <p className="p-5 text-slate-500">No matching records for this report.</p>
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
  const apply = (): void => {
    if (!currentOnly && filter.from > filter.to) {
      setError('The “From” date must be on or before the “Through” date.')
      return
    }
    void run(async () => setReport(await getReport({ ...filter, page: 1 })))
  }
  const cleared = initialFilter()
  const isCleared =
    filter.kind === cleared.kind &&
    filter.from === cleared.from &&
    filter.to === cleared.to &&
    !filter.search
  return (
    <DashboardShell pageTitle="Business Reports">
      <div className="space-y-5">
        <header className="page-intro">
          <p className="eyebrow">Business</p>
          <h2 className="page-title mt-0.5">Reports</h2>
          <p className="page-subtitle">
            Live database reports. Choose the same start and end date for a daily report. Amounts
            are in Philippine pesos.
          </p>
        </header>
        <form
          className="panel space-y-4 p-5 sm:p-6"
          onSubmit={(event) => {
            event.preventDefault()
            apply()
          }}
        >
          {/* Note: The section's actions sit above its fields, in the section header. */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="section-title">Report Filters</h3>
              <p className="section-subtitle">
                Pick a report and period, then apply. Changing the report type loads it at once.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="secondary-button"
                disabled={busy || isCleared}
                onClick={() => {
                  const next = initialFilter()
                  setFilter(next)
                  setError('')
                  void run(async () => setReport(await getReport(next)))
                }}
              >
                Clear All Fields
              </button>
              <button type="submit" className="primary-button" disabled={busy}>
                {busy ? 'Generating…' : 'Apply Filters'}
              </button>
            </div>
          </div>
          <fieldset
            disabled={busy}
            className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-4"
          >
            <label className="field-label">
              Report<span className="required-mark">*</span>
              <select
                className="field mt-1.5 font-normal"
                value={filter.kind}
                onChange={(event) => {
                  // Note: Switching report type loads it immediately so the table never shows
                  // the previous report under the new title.
                  const next = { ...filter, kind: event.target.value as ReportKind, page: 1 }
                  setFilter(next)
                  setReport(null)
                  void run(async () => setReport(await getReport(next)))
                }}
              >
                {Object.entries(reportTitles).map(([kind, title]) => (
                  <option value={kind} key={kind}>
                    {title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              From{!currentOnly && <span className="required-mark">*</span>}
              <input
                className="field mt-1.5 font-normal"
                type="date"
                required
                disabled={currentOnly}
                max={filter.to}
                value={filter.from}
                onChange={(event) => setFilter({ ...filter, from: event.target.value })}
              />
            </label>
            <label className="field-label">
              Through{!currentOnly && <span className="required-mark">*</span>}
              <input
                className="field mt-1.5 font-normal"
                type="date"
                required
                disabled={currentOnly}
                min={filter.from}
                value={filter.to}
                onChange={(event) => setFilter({ ...filter, to: event.target.value })}
              />
            </label>
            <label className="field-label">
              Client, Supplier, Product or Reference
              <input
                className="field mt-1.5 font-normal"
                maxLength={120}
                disabled={filter.kind === 'financial'}
                value={filter.search}
                onChange={(event) => setFilter({ ...filter, search: event.target.value })}
                placeholder="Search relevant report fields"
              />
            </label>
          </fieldset>
          {currentOnly && (
            <p className="text-sm text-slate-600">
              This report shows current data across all dates.
            </p>
          )}
        </form>
        {error && (
          <p role="alert" className="status-message border-rose-200 bg-rose-50 text-rose-800">
            {error}
          </p>
        )}
        {notice && (
          <p
            role="status"
            className="status-message border-emerald-200 bg-emerald-50 text-emerald-800"
          >
            {notice}
          </p>
        )}
        {busy && <p role="status">Loading report data…</p>}
        {report && (
          <>
            {/* Note: Most important first: the report's key figures, then its rows, then notes. */}
            <section className="panel space-y-4 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="section-title">{report.title}</h3>
                  <p className="text-sm text-slate-600">
                    {['inventory', 'overdue'].includes(report.filter.kind)
                      ? 'Current snapshot'
                      : `${report.filter.from} through ${report.filter.to}`}{' '}
                    ·{' '}
                    {report.filter.search
                      ? `Search: ${report.filter.search}`
                      : 'All matching records'}{' '}
                    · Generated {new Date(report.generatedAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="primary-button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        if (await exportReportPdf(report.filter))
                          setNotice('PDF saved with all matching rows and current totals.')
                      })
                    }
                  >
                    <FiFileText aria-hidden="true" /> Save as PDF
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        if (await exportReport(report.filter))
                          setNotice('CSV exported with all matching rows for spreadsheet use.')
                      })
                    }
                  >
                    <FiDownload aria-hidden="true" /> Export CSV
                  </button>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {report.metrics.map((metric, index) => (
                  <article
                    className={`rounded-lg border p-4 ${index === 0 ? 'border-brand-200 bg-brand-50/60' : 'border-slate-200 bg-white'}`}
                    key={metric.label}
                  >
                    <p className="text-sm font-semibold text-slate-600">
                      {titleCase(metric.label)}
                    </p>
                    <p className="mt-1 text-2xl font-bold break-words text-slate-950 tabular-nums">
                      {metric.format === 'money'
                        ? money(metric.value)
                        : metric.value.toLocaleString()}
                    </p>
                  </article>
                ))}
              </div>
            </section>
            <section className="panel min-w-0 overflow-hidden">
              <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
                <h3 className="section-title text-lg">Report Details</h3>
              </div>
              <ReportTable report={report} />
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-4">
                <p className="text-sm text-slate-600">
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
            {report.notes.length > 0 && (
              <section className="panel space-y-1.5 p-5 sm:p-6">
                <h3 className="card-title">About This Report</h3>
                {report.notes.map((note) => (
                  <p className="text-sm text-slate-600" key={note}>
                    {note}
                  </p>
                ))}
              </section>
            )}
          </>
        )}
        <section className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="bg-brand-50 text-brand-700 grid size-10 shrink-0 place-items-center rounded-lg">
              <FiPackage aria-hidden="true" />
            </span>
            <div>
              <h3 className="card-title">Receiving Reports</h3>
              <p className="text-sm text-slate-600">
                Deliveries received against purchase orders, with batch numbers and expiry dates.
                They open in Suppliers &amp; Purchasing, where stock is received.
              </p>
            </div>
          </div>
          <Link to="/suppliers" search={{ tab: 'receiving' }} className="secondary-button shrink-0">
            Open Receiving Reports
          </Link>
        </section>
      </div>
    </DashboardShell>
  )
}
