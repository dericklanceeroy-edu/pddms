import type {
  DashboardOperationsPulseId,
  DashboardOperationsPulseItem,
  DashboardOperationStatus
} from '@renderer/data/adminDashboard'
import type { ReactElement } from 'react'
import type { IconType } from 'react-icons'
import { FiAlertTriangle, FiClipboard, FiCreditCard, FiDatabase, FiTruck } from 'react-icons/fi'

const operationIcons: Record<DashboardOperationsPulseId, IconType> = {
  'purchase-orders': FiClipboard,
  'supplier-payments': FiCreditCard,
  'stock-valuation': FiDatabase,
  'inventory-alerts': FiAlertTriangle
}

const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0
})

const numberFormatter = new Intl.NumberFormat('en-PH')

const operationBorders = [
  '',
  'border-t border-neutral-100 sm:border-t-0 sm:border-l',
  'border-t border-neutral-100 xl:border-t-0 xl:border-l',
  'border-t border-neutral-100 sm:border-l xl:border-t-0'
]

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
  return (
    <article className="overflow-hidden rounded-2xl border border-neutral-200/80 bg-white shadow-sm">
      <header className="flex items-start justify-between gap-4 border-b border-neutral-100 px-5 py-5 sm:px-6">
        <div className="flex min-w-0 gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-cyan-50 text-cyan-700">
            <FiTruck className="size-4.5" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-semibold tracking-tight text-neutral-950">Operations pulse</h3>
            <p className="mt-0.5 text-xs leading-5 text-neutral-500">
              Current procurement, finance, and inventory signals
            </p>
          </div>
        </div>
        <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-600">
          {items.length} signals
        </span>
      </header>
      {items.length === 0 ? (
        <div className="px-6 py-12 text-center">
          <p className="text-sm font-medium text-neutral-700">No operational updates.</p>
          <p className="mt-1 text-xs text-neutral-500">
            New alerts will appear as work progresses.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-4">
          {items.map((item, index) => {
            const Icon = operationIcons[item.id]

            return (
              <div key={item.id} className={`p-5 sm:p-6 ${operationBorders[index]}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="grid size-9 place-items-center rounded-xl bg-neutral-100 text-neutral-600">
                    <Icon className="size-4" aria-hidden="true" />
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 text-[0.65rem] font-semibold ring-1 ${statusStyles[item.status]}`}
                  >
                    {statusLabels[item.status]}
                  </span>
                </div>
                <p className="mt-4 text-2xl font-semibold tracking-tight text-neutral-950 tabular-nums">
                  {item.format === 'currency'
                    ? currencyFormatter.format(item.value)
                    : numberFormatter.format(item.value)}
                </p>
                <p className="mt-1 text-sm font-medium text-neutral-700">{item.label}</p>
                <p className="mt-2 text-xs leading-5 text-neutral-500">{item.detail}</p>
              </div>
            )
          })}
        </div>
      )}
    </article>
  )
}
