import { useAdminDashboard } from '@renderer/hooks/useAdminDashboard'
import type { ReactElement } from 'react'
import { FiAlertCircle, FiInfo, FiRefreshCw } from 'react-icons/fi'
import DashboardShell from './DashboardShell'
import { ExpiryWatchlist, LowStockWatchlist, RecentTransactions } from './DashboardTables'
import OperationsPulse from './OperationsPulse'
import SalesCategoryChart from './SalesCategoryChart'
import SummaryCard from './SummaryCard'

function SectionHeading({
  eyebrow,
  title,
  description
}: {
  eyebrow: string
  title: string
  description: string
}): ReactElement {
  return (
    <div>
      <p className="text-[0.68rem] font-semibold tracking-[0.17em] text-blue-700 uppercase">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>
    </div>
  )
}

function DashboardLoading(): ReactElement {
  return (
    <div aria-busy="true" aria-label="Loading dashboard" className="animate-pulse space-y-8">
      <span className="sr-only">Loading dashboard data.</span>
      <div className="space-y-3">
        <div className="h-3 w-28 rounded bg-slate-200" />
        <div className="h-8 w-72 max-w-full rounded-lg bg-slate-200" />
        <div className="h-4 w-[32rem] max-w-full rounded bg-slate-200" />
      </div>
      <div className="h-16 rounded-2xl bg-slate-200/80" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-48 rounded-2xl bg-slate-200/80" />
        ))}
      </div>
      <div className="grid gap-5 min-[1500px]:grid-cols-2 min-[1840px]:grid-cols-3">
        <div className="h-96 rounded-2xl bg-slate-200/80" />
        <div className="h-96 rounded-2xl bg-slate-200/80" />
        <div className="h-96 rounded-2xl bg-slate-200/80 min-[1500px]:col-span-2 min-[1840px]:col-span-1" />
      </div>
    </div>
  )
}

function DashboardError({
  message,
  retry
}: {
  message: string
  retry: VoidFunction
}): ReactElement {
  return (
    <div
      role="alert"
      className="grid min-h-[28rem] place-items-center rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-sm"
    >
      <div className="max-w-md">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-rose-50 text-rose-600">
          <FiAlertCircle className="size-5" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-slate-950">Dashboard unavailable</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">{message}</p>
        <button
          type="button"
          onClick={retry}
          className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <FiRefreshCw aria-hidden="true" />
          Try again
        </button>
      </div>
    </div>
  )
}

export default function AdminDashboard(): ReactElement {
  const { data, error, isLoading, reload } = useAdminDashboard()

  return (
    <DashboardShell
      source={data?.source ?? null}
      isRefreshing={isLoading}
      onRefresh={() => void reload()}
    >
      {!data && isLoading ? (
        <DashboardLoading />
      ) : !data && error ? (
        <DashboardError message={error} retry={() => void reload()} />
      ) : data ? (
        <div className="space-y-10">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
            >
              <FiAlertCircle className="mt-0.5 shrink-0" aria-hidden="true" />
              <p>
                Refresh failed. The last available dashboard snapshot is still being shown. {error}
              </p>
            </div>
          )}
          <section id="overview" className="scroll-mt-28 space-y-6">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
              <div>
                <p className="text-[0.68rem] font-semibold tracking-[0.17em] text-blue-700 uppercase">
                  Sample overview
                </p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                  Med Prix dashboard preview
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                  Monitor sales performance, inventory risk, and operational work from one view.
                </p>
              </div>
              <div className="inline-flex w-fit items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 ring-1 ring-blue-100">
                <span className="size-2 rounded-full bg-blue-500" aria-hidden="true" />
                Demo snapshot loaded
              </div>
            </div>
            <div
              role="note"
              className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-900"
            >
              <FiInfo className="mt-0.5 shrink-0" aria-hidden="true" />
              <p className="leading-6">
                <span className="font-semibold">Preview mode.</span> {data.source.message}
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {data.summaryMetrics.map((metric) => (
                <SummaryCard key={metric.id} metric={metric} />
              ))}
            </div>
          </section>
          <section id="inventory-alerts" className="scroll-mt-28 space-y-5">
            <SectionHeading
              eyebrow="Inventory health"
              title="Act before stock becomes a loss"
              description="Prioritize short-dated batches and products that have crossed their reorder level."
            />
            <div className="grid gap-5 min-[1500px]:grid-cols-2 min-[1840px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(17rem,0.78fr)]">
              <ExpiryWatchlist alerts={data.expiryAlerts} />
              <LowStockWatchlist alerts={data.lowStockAlerts} />
              <div className="min-[1500px]:col-span-2 min-[1840px]:col-span-1">
                <SalesCategoryChart categories={data.categorySales} />
              </div>
            </div>
          </section>
          <section id="sales-activity" className="scroll-mt-28 space-y-5">
            <SectionHeading
              eyebrow="Sales activity"
              title="Recent transaction preview"
              description="Inspect the sample receipt totals, customer discounts, and cashier activity layout."
            />
            <RecentTransactions transactions={data.recentTransactions} />
          </section>
          <section id="operations" className="scroll-mt-28 space-y-5 pb-2">
            <SectionHeading
              eyebrow="Operations"
              title="Work that needs management attention"
              description="Preview procurement deadlines, stock valuation, and open inventory alerts."
            />
            <OperationsPulse items={data.operationsPulse} />
          </section>
        </div>
      ) : null}
    </DashboardShell>
  )
}
