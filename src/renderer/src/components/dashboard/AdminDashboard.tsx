import { useAdminDashboard } from '@renderer/hooks/useAdminDashboard'
import type { ReactElement } from 'react'
import { FiAlertCircle, FiRefreshCw } from 'react-icons/fi'
import DashboardShell from './DashboardShell'
import { ExpiryWatchlist, LowStockWatchlist, RecentTransactions } from './DashboardTables'
import OperationsPulse from './OperationsPulse'
import SalesCategoryChart from './SalesCategoryChart'
import SummaryCard from './SummaryCard'

function DashboardLoading(): ReactElement {
  return (
    <div aria-busy="true" aria-label="Loading dashboard" className="animate-pulse space-y-8">
      <span className="sr-only">Loading dashboard data.</span>
      <div className="space-y-3">
        <div className="h-3 w-28 rounded bg-neutral-200" />
        <div className="h-8 w-72 max-w-full rounded-lg bg-neutral-200" />
        <div className="h-4 w-[32rem] max-w-full rounded bg-neutral-200" />
      </div>
      <div className="h-16 rounded-2xl bg-neutral-200/80" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-48 rounded-2xl bg-neutral-200/80" />
        ))}
      </div>
      <div className="grid gap-5 min-[1500px]:grid-cols-2 min-[1840px]:grid-cols-3">
        <div className="h-96 rounded-2xl bg-neutral-200/80" />
        <div className="h-96 rounded-2xl bg-neutral-200/80" />
        <div className="h-96 rounded-2xl bg-neutral-200/80 min-[1500px]:col-span-2 min-[1840px]:col-span-1" />
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
        <h2 className="mt-4 text-lg font-semibold text-neutral-950">Dashboard unavailable</h2>
        <p className="mt-2 text-sm leading-6 text-neutral-500">{message}</p>
        <button
          type="button"
          onClick={retry}
          className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-mauve-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-mauve-700 focus-visible:ring-2 focus-visible:ring-mauve-500 focus-visible:ring-offset-2 focus-visible:outline-none"
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
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-neutral-950 sm:text-3xl">
                  Dashboard
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
                  Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                </p>
              </div>
              <div className="inline-flex w-fit items-center gap-2 rounded-full bg-mauve-50 px-3 py-1.5 text-xs font-medium text-mauve-700 ring-1 ring-mauve-100">
                <span className="size-2 rounded-full bg-mauve-500" aria-hidden="true" />
                Demo snapshot loaded
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {data.summaryMetrics.map((metric) => (
                <SummaryCard key={metric.id} metric={metric} />
              ))}
            </div>
          </section>
          <section id="inventory-alerts" className="scroll-mt-28 space-y-5">
            <div className="grid gap-5 min-[1500px]:grid-cols-2 min-[1840px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(17rem,0.78fr)]">
              <ExpiryWatchlist alerts={data.expiryAlerts} />
              <LowStockWatchlist alerts={data.lowStockAlerts} />
              <div className="min-[1500px]:col-span-2 min-[1840px]:col-span-1">
                <SalesCategoryChart categories={data.categorySales} />
              </div>
            </div>
          </section>
          <section id="sales-activity" className="scroll-mt-28 space-y-5">
            <RecentTransactions transactions={data.recentTransactions} />
          </section>
          <section id="operations" className="scroll-mt-28 space-y-5 pb-2">
            <OperationsPulse items={data.operationsPulse} />
          </section>
        </div>
      ) : null}
    </DashboardShell>
  )
}
