import type {
  DashboardOperationsPulseId,
  DashboardOperationsPulseItem,
  DashboardOperationStatus
} from '@renderer/data/adminDashboard'
import { useAccount } from '@renderer/hooks/useAccount'
import { canAccessPath } from '@renderer/navigation/access'
import { Link } from '@tanstack/react-router'
import type { ReactElement } from 'react'
import type { IconType } from 'react-icons'
import { FiAlertTriangle, FiClipboard, FiCreditCard, FiDatabase, FiTruck } from 'react-icons/fi'

const operationIcons: Record<DashboardOperationsPulseId, IconType> = {
  'purchase-orders': FiClipboard,
  'supplier-payments': FiCreditCard,
  'stock-valuation': FiDatabase,
  'inventory-alerts': FiAlertTriangle
}

/** Page and tab where each signal's records are managed. */
const destinations: Record<
  DashboardOperationsPulseId,
  { to: '/suppliers' | '/inventory'; tab?: 'orders' | 'invoices'; label: string }
> = {
  'purchase-orders': { to: '/suppliers', tab: 'orders', label: 'Open purchase orders' },
  'supplier-payments': { to: '/suppliers', tab: 'invoices', label: 'Open invoices & payments' },
  'stock-valuation': { to: '/inventory', label: 'Open inventory' },
  'inventory-alerts': { to: '/inventory', label: 'Open inventory' }
}

const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 2
})

const numberFormatter = new Intl.NumberFormat('en-PH')

const statusStyles: Record<DashboardOperationStatus, string> = {
  healthy: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  attention: 'bg-amber-50 text-amber-700 ring-amber-100',
  critical: 'bg-rose-50 text-rose-700 ring-rose-100'
}

const statusLabels: Record<DashboardOperationStatus, string> = {
  healthy: 'On track',
  attention: 'Review',
  critical: 'Action due'
}

export default function OperationsPulse({
  items
}: {
  items: DashboardOperationsPulseItem[]
}): ReactElement {
  const { account } = useAccount()
  return (
    <article className="panel overflow-hidden">
      <header className="surface-header flex items-start justify-between gap-4 px-5 py-5 sm:px-6">
        <div className="flex min-w-0 gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-cyan-50 text-cyan-700 ring-1 ring-cyan-100">
            <FiTruck className="size-4.5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-semibold tracking-tight text-slate-950">Purchasing and stock</h3>
            <p className="mt-0.5 text-xs leading-5 text-slate-500">
              Open purchase orders, supplier invoices due and stock signals
            </p>
          </div>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-white/70">
          {items.length} signals
        </span>
      </header>
      {items.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="text-sm font-medium text-slate-700">No operational updates.</p>
          <p className="mt-1 text-xs text-slate-500">New alerts will appear as work progresses.</p>
        </div>
      ) : (
        <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => {
            const Icon = operationIcons[item.id]

            return (
              <div
                key={item.id}
                className="min-w-0 rounded-md border border-slate-200 bg-white p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="grid size-9 place-items-center rounded-lg bg-slate-100/80 text-slate-600 ring-1 ring-white/80">
                    <Icon className="size-4" aria-hidden="true" />
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-[0.65rem] font-semibold ring-1 ${statusStyles[item.status]}`}
                  >
                    {statusLabels[item.status]}
                  </span>
                </div>
                <p className="mt-4 text-2xl font-semibold tracking-tight text-slate-950 tabular-nums">
                  {item.format === 'currency'
                    ? currencyFormatter.format(item.value)
                    : numberFormatter.format(item.value)}
                </p>
                <p className="mt-1 text-sm font-medium text-slate-700">{item.label}</p>
                <p className="mt-2 text-xs leading-5 text-slate-500">{item.detail}</p>
                {account && canAccessPath(account.role, destinations[item.id].to) && (
                  <Link
                    to={destinations[item.id].to}
                    search={
                      destinations[item.id].tab ? { tab: destinations[item.id].tab } : undefined
                    }
                    className="text-brand-700 mt-3 inline-flex text-xs font-semibold hover:underline"
                  >
                    {destinations[item.id].label} »
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      )}
    </article>
  )
}
