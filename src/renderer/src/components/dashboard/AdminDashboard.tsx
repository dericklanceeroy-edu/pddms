import type { DashboardView } from '@renderer/data/adminDashboard'
import { useAdminDashboard } from '@renderer/hooks/useAdminDashboard'
import type { ReactElement } from 'react'
import { FiAlertCircle, FiRefreshCw } from 'react-icons/fi'
import DashboardShell from './DashboardShell'
import { ExpiryWatchlist, LowStockWatchlist, RecentTransactions } from './DashboardTables'
import OperationsPulse from './OperationsPulse'
import QuickActions from './QuickActions'
import SummaryCard from './SummaryCard'

function DashboardLoading(): ReactElement {
  return (
    <div aria-busy="true" aria-label="Loading dashboard" className="animate-pulse space-y-6">
      <span className="sr-only">Loading dashboard data.</span>
      <div className="panel space-y-3 p-6 sm:p-7">
        <div className="skeleton h-3 w-28 rounded-full" />
        <div className="skeleton h-8 w-72 max-w-full rounded-md" />
        <div className="skeleton h-4 w-[32rem] max-w-full rounded-full" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="skeleton h-44 rounded-lg" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-2 2xl:grid-cols-12">
        <div className="skeleton h-96 rounded-lg 2xl:col-span-5" />
        <div className="skeleton h-96 rounded-lg 2xl:col-span-4" />
        <div className="skeleton h-96 rounded-lg xl:col-span-2 2xl:col-span-3" />
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
      className="panel grid min-h-[28rem] place-items-center border-rose-200/80 bg-rose-50/45 p-6 text-center"
    >
      <div className="max-w-md">
        <div className="mx-auto grid size-12 place-items-center rounded-lg bg-rose-50/90 text-rose-600 ring-1 ring-rose-100">
          <FiAlertCircle className="size-5" aria-hidden="true" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-slate-950">Dashboard unavailable</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">{message}</p>
        <button
          type="button"
          onClick={retry}
          className="bg-brand-600 hover:bg-brand-700 focus-visible:ring-brand-500 mt-5 inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-semibold text-white shadow-sm transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <FiRefreshCw aria-hidden="true" />
          Try again
        </button>
      </div>
    </div>
  )
}

const views: Record<DashboardView, { title: string; subtitle: string }> = {
  admin: {
    title: 'Admin dashboard',
    subtitle:
      'Today’s sales, stock that needs attention and purchasing status, taken live from the pharmacy database.'
  },
  staff: {
    title: 'Pharmacy operations',
    subtitle:
      'Stock that needs attention, deliveries to receive and supplier invoices due, taken live from the database.'
  },
  cashier: {
    title: 'Checkout',
    subtitle:
      'Your sales today and products running low. Start a sale to search products and stock.'
  }
}

/**
 * One dashboard route for every role. The main process decides which figures each role receives;
 * this component only arranges them and offers the shortcuts the role is allowed to open.
 */
export default function AdminDashboard(): ReactElement {
  const { data, error, isLoading, reload } = useAdminDashboard()
  const view = data?.view ?? 'admin'

  return (
    <DashboardShell
      pageTitle={data ? views[view].title : 'Dashboard'}
      source={data?.source ?? null}
      isLoading={!data && isLoading}
      isRefreshing={isLoading}
      onRefresh={() => void reload()}
    >
      {!data && isLoading ? (
        <DashboardLoading />
      ) : !data && error ? (
        <DashboardError message={error} retry={() => void reload()} />
      ) : data ? (
        <div className="space-y-6">
          {error && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-lg border border-rose-200/70 bg-rose-50/65 px-5 py-4 text-sm text-rose-800 shadow-sm"
            >
              <FiAlertCircle className="mt-0.5 shrink-0" aria-hidden="true" />
              <p>
                Refresh failed. The last available dashboard snapshot is still being shown. {error}
              </p>
            </div>
          )}
          <section id="overview" className="scroll-mt-28">
            <div className="page-intro">
              <div className="page-intro-content">
                <h2 className="page-title">{views[view].title}</h2>
                <p className="page-subtitle">{views[view].subtitle}</p>
              </div>
            </div>
            <QuickActions view={view} />
            <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {data.summaryMetrics.map((metric) => (
                <SummaryCard key={metric.id} metric={metric} />
              ))}
            </div>
          </section>
          {view === 'cashier' ? (
            <>
              <section id="sales-activity" className="scroll-mt-28">
                <RecentTransactions
                  transactions={data.recentTransactions}
                  title="My recent sales"
                  description="Your latest completed sales. Open Sales & dispensing for receipts."
                  showCashier={false}
                />
              </section>
              <section id="inventory-alerts" className="scroll-mt-28 pb-2">
                <LowStockWatchlist alerts={data.lowStockAlerts} />
              </section>
            </>
          ) : (
            <>
              <section id="inventory-alerts" className="scroll-mt-28">
                <div className="grid gap-5 2xl:grid-cols-2">
                  <div className="min-w-0">
                    <ExpiryWatchlist alerts={data.expiryAlerts} />
                  </div>
                  <div className="min-w-0">
                    <LowStockWatchlist alerts={data.lowStockAlerts} />
                  </div>
                </div>
              </section>
              {view === 'admin' && (
                <section id="sales-activity" className="scroll-mt-28">
                  <RecentTransactions transactions={data.recentTransactions} />
                </section>
              )}
              <section id="operations" className="scroll-mt-28 pb-2">
                <OperationsPulse items={data.operationsPulse} />
              </section>
            </>
          )}
        </div>
      ) : null}
    </DashboardShell>
  )
}
