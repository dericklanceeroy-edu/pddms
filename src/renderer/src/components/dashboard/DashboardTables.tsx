import type {
  DashboardAlertSeverity,
  DashboardExpiryAlert,
  DashboardLowStockAlert,
  DashboardRecentTransaction
} from '@renderer/data/adminDashboard'
import type { ReactElement } from 'react'
import { FiAlertTriangle, FiCalendar, FiClock, FiShoppingBag } from 'react-icons/fi'

const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2
})

const dateFormatter = new Intl.DateTimeFormat('en-PH', {
  month: 'short',
  day: 'numeric',
  year: 'numeric'
})

const timeFormatter = new Intl.DateTimeFormat('en-PH', {
  hour: 'numeric',
  minute: '2-digit'
})

const severityStyles: Record<DashboardAlertSeverity, string> = {
  critical: 'bg-rose-50 text-rose-700 ring-rose-100',
  warning: 'bg-amber-50 text-amber-700 ring-amber-100',
  watch: 'bg-mauve-50 text-mauve-700 ring-mauve-100'
}

const severityLabels: Record<DashboardAlertSeverity, string> = {
  critical: 'Urgent',
  warning: 'Soon',
  watch: 'Watch'
}

function PanelHeader({
  title,
  description,
  headingId,
  count,
  icon: Icon,
  tone
}: {
  title: string
  description: string
  headingId: string
  count: number
  icon: typeof FiCalendar
  tone: string
}): ReactElement {
  return (
    <header className="surface-header flex items-start justify-between gap-4 px-5 py-5 sm:px-6">
      <div className="flex min-w-0 gap-3">
        <div
          className={`grid size-10 shrink-0 place-items-center rounded-2xl ring-1 ring-white/60 ${tone}`}
        >
          <Icon className="size-4.5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 id={headingId} className="font-semibold tracking-tight text-neutral-950">
            {title}
          </h3>
          <p className="mt-0.5 text-xs leading-5 text-neutral-500">{description}</p>
        </div>
      </div>
      <span className="rounded-full bg-white/70 px-2.5 py-1 text-xs font-semibold text-neutral-600 ring-1 ring-white/70 backdrop-blur-sm">
        {count}
      </span>
    </header>
  )
}

function EmptyTable({ colSpan, label }: { colSpan: number; label: string }): ReactElement {
  return (
    <tr>
      <td colSpan={colSpan} className="px-5 py-12 text-center">
        <div className="mx-auto grid size-10 place-items-center rounded-2xl bg-emerald-50/80 text-emerald-600 ring-1 ring-emerald-100">
          <FiClock className="size-4" aria-hidden="true" />
        </div>
        <p className="mt-3 text-sm font-medium text-neutral-700">{label}</p>
        <p className="mt-1 text-xs text-neutral-500">New records will appear here automatically.</p>
      </td>
    </tr>
  )
}

function SeverityPill({ severity }: { severity: DashboardAlertSeverity }): ReactElement {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-[0.68rem] font-semibold ring-1 ${severityStyles[severity]}`}
    >
      {severityLabels[severity]}
    </span>
  )
}

export function ExpiryWatchlist({ alerts }: { alerts: DashboardExpiryAlert[] }): ReactElement {
  return (
    <article className="panel min-w-0 overflow-hidden">
      <PanelHeader
        title="Expiry watchlist"
        description="Live batches expiring within the next 90 days"
        headingId="expiry-watchlist-title"
        count={alerts.length}
        icon={FiCalendar}
        tone="bg-amber-50 text-amber-700"
      />
      <div className="overflow-x-auto">
        <table
          aria-labelledby="expiry-watchlist-title"
          className="w-full min-w-[35rem] text-left text-sm"
        >
          <thead className="border-b border-white/70 bg-slate-50/60 text-[0.68rem] tracking-wide text-neutral-500 uppercase">
            <tr>
              <th scope="col" className="px-5 py-3 font-semibold sm:px-6">
                Product
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Batch
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Stock
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Expiry date
              </th>
              <th scope="col" className="px-5 py-3 text-right font-semibold sm:px-6">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/60">
            {alerts.length === 0 ? (
              <EmptyTable colSpan={5} label="No batches are nearing expiry." />
            ) : (
              alerts.map((alert) => (
                <tr key={alert.id} className="transition-colors hover:bg-mauve-50/35">
                  <th scope="row" className="px-5 py-4 font-medium text-neutral-800 sm:px-6">
                    {alert.productName}
                  </th>
                  <td className="px-4 py-4 font-mono text-xs text-neutral-500">
                    {alert.batchNumber}
                  </td>
                  <td className="px-4 py-4 text-right font-medium text-neutral-700 tabular-nums">
                    {alert.stockRemaining}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-neutral-600">
                    {alert.expiryStatus === 'unknown'
                      ? 'Invalid expiry date'
                      : dateFormatter.format(new Date(alert.expiresAt))}
                  </td>
                  <td className="px-5 py-4 text-right sm:px-6">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${alert.expiryStatus === 'expired' || alert.expiryStatus === 'unknown' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'}`}
                    >
                      {alert.expiryStatus === 'expired'
                        ? 'Expired'
                        : alert.expiryStatus === 'unknown'
                          ? 'Invalid expiry'
                          : 'Nearing expiry'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </article>
  )
}

export function LowStockWatchlist({ alerts }: { alerts: DashboardLowStockAlert[] }): ReactElement {
  return (
    <article className="panel min-w-0 overflow-hidden">
      <PanelHeader
        title="Low-stock alert"
        description="Products at or below the system reorder level"
        headingId="low-stock-watchlist-title"
        count={alerts.length}
        icon={FiAlertTriangle}
        tone="bg-rose-50 text-rose-700"
      />
      <div className="overflow-x-auto">
        <table
          aria-labelledby="low-stock-watchlist-title"
          className="w-full min-w-[34rem] text-left text-sm"
        >
          <thead className="border-b border-white/70 bg-slate-50/60 text-[0.68rem] tracking-wide text-neutral-500 uppercase">
            <tr>
              <th scope="col" className="px-5 py-3 font-semibold sm:px-6">
                Product
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                On hand
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Reorder at
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Last stocked
              </th>
              <th scope="col" className="px-5 py-3 text-right font-semibold sm:px-6">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/60">
            {alerts.length === 0 ? (
              <EmptyTable colSpan={5} label="Every product is above its reorder level." />
            ) : (
              alerts.map((alert) => (
                <tr key={alert.id} className="transition-colors hover:bg-mauve-50/35">
                  <th scope="row" className="px-5 py-4 font-medium text-neutral-800 sm:px-6">
                    {alert.productName}
                  </th>
                  <td className="px-4 py-4 text-right">
                    <span className="inline-flex min-w-8 justify-center rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 tabular-nums">
                      {alert.stockRemaining}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right font-medium text-neutral-700 tabular-nums">
                    {alert.reorderLevel}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-neutral-600">
                    {alert.lastRestockedAt
                      ? dateFormatter.format(new Date(alert.lastRestockedAt))
                      : 'Not recorded'}
                  </td>
                  <td className="px-5 py-4 text-right sm:px-6">
                    <SeverityPill severity={alert.severity} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </article>
  )
}

export function RecentTransactions({
  transactions
}: {
  transactions: DashboardRecentTransaction[]
}): ReactElement {
  return (
    <article className="panel min-w-0 overflow-hidden">
      <PanelHeader
        title="Recent transactions"
        description="Completed pharmacy sales from the database"
        headingId="recent-transactions-title"
        count={transactions.length}
        icon={FiShoppingBag}
        tone="bg-mauve-50 text-mauve-700"
      />
      <div className="overflow-x-auto">
        <table
          aria-labelledby="recent-transactions-title"
          className="w-full min-w-[58rem] text-left text-sm"
        >
          <thead className="border-b border-white/70 bg-slate-50/60 text-[0.68rem] tracking-wide text-neutral-500 uppercase">
            <tr>
              <th scope="col" className="px-5 py-3 font-semibold sm:px-6">
                Receipt
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Date & time
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Cashier
              </th>
              <th scope="col" className="px-4 py-3 text-right font-semibold">
                Items
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Discount
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                Payment
              </th>
              <th scope="col" className="px-5 py-3 text-right font-semibold sm:px-6">
                Amount
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/60">
            {transactions.length === 0 ? (
              <EmptyTable colSpan={7} label="No transactions have been recorded yet." />
            ) : (
              transactions.map((transaction) => {
                const occurredAt = new Date(transaction.occurredAt)

                return (
                  <tr key={transaction.id} className="transition-colors hover:bg-mauve-50/35">
                    <th scope="row" className="px-5 py-4 font-semibold text-mauve-700 sm:px-6">
                      {transaction.id}
                    </th>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <p className="font-medium text-neutral-700">
                        {dateFormatter.format(occurredAt)}
                      </p>
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {timeFormatter.format(occurredAt)}
                      </p>
                    </td>
                    <td className="px-4 py-4 text-neutral-600">{transaction.cashierName}</td>
                    <td className="px-4 py-4 text-right font-medium text-neutral-700 tabular-nums">
                      {transaction.itemCount}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                          transaction.discountType === 'None'
                            ? 'bg-neutral-100 text-neutral-600'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {transaction.discountType}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        {transaction.paymentMethod}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right font-semibold whitespace-nowrap text-neutral-900 tabular-nums sm:px-6">
                      {currencyFormatter.format(transaction.amount)}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </article>
  )
}
