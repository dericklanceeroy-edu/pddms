import DashboardShell from '@renderer/components/dashboard/DashboardShell'
import {
  getItemStock,
  getSellableStock,
  getStockStatus,
  type ItemProfile
} from '@renderer/data/profiles'
import { useAccount } from '@renderer/hooks/useAccount'
import { exportInventory } from '@renderer/services/inventory'
import { useProfileStore } from '@renderer/stores/useProfileStore'
import { getExpiryStatus } from '@shared/inventory'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import {
  FiAlertTriangle,
  FiArchive,
  FiChevronRight,
  FiLayers,
  FiPlus,
  FiRefreshCw,
  FiSearch
} from 'react-icons/fi'
import InventoryReport from './InventoryReport'

const expiryDate = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' })

type StockFilter = 'all' | 'low-stock' | 'out-of-stock' | 'near-expiry' | 'expired'

const stockFilters: Array<{ id: StockFilter; label: string }> = [
  { id: 'all', label: 'All products' },
  { id: 'low-stock', label: 'Low stock' },
  { id: 'out-of-stock', label: 'Out of stock' },
  { id: 'near-expiry', label: 'Expiring soon' },
  { id: 'expired', label: 'Expired stock on hand' }
]

function matchesFilter(item: ItemProfile, filter: StockFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'low-stock' || filter === 'out-of-stock') return getStockStatus(item) === filter
  return item.batches.some(
    (batch) => batch.stock > 0 && getExpiryStatus(batch.expiresAt) === filter
  )
}

const statusLabels = {
  'in-stock': 'In stock',
  'low-stock': 'Low stock',
  'out-of-stock': 'Out of stock'
}

export default function ItemDirectory(): ReactElement {
  const { account } = useAccount()
  const items = useProfileStore((state) => state.items)
  const loadItems = useProfileStore((state) => state.loadItems)
  const loadError = useProfileStore((state) => state.error)
  const isLoading = useProfileStore((state) => state.isLoading)
  const [report, setReport] = useState(false)
  const [message, setMessageState] = useState<{ text: string; tone: 'success' | 'error' } | null>(
    null
  )
  const setMessage = (text: string, tone: 'success' | 'error' = 'success'): void =>
    setMessageState(text ? { text, tone } : null)
  const [exporting, setExporting] = useState(false)

  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<StockFilter>('all')

  const filteredItems = useMemo(() => {
    const search = query.trim().toLowerCase()

    return items.filter(
      (item) =>
        matchesFilter(item, filter) &&
        (!search ||
          `${item.genericName} ${item.brandName} ${item.category} ${item.formulation}`
            .toLowerCase()
            .includes(search))
    )
  }, [items, query, filter])

  const inventoryMetrics = useMemo(() => {
    let availableUnits = 0
    let lowStock = 0
    let outOfStock = 0

    items.forEach((item) => {
      const status = getStockStatus(item)

      availableUnits += getItemStock(item)
      if (status === 'low-stock') lowStock += 1
      if (status === 'out-of-stock') outOfStock += 1
    })

    return {
      availableUnits,
      lowStock,
      outOfStock,
      products: items.length
    }
  }, [items])

  useEffect(() => {
    void loadItems(true)
    const refresh = (): void => {
      void loadItems(true)
    }
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [loadItems])

  return (
    <DashboardShell pageTitle="Inventory">
      <div className="space-y-5 sm:space-y-6">
        <section className="page-intro">
          <div className="page-intro-content flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div className="max-w-2xl min-w-0">
              <p className="eyebrow">Stock & purchasing</p>
              <h2 className="page-title mt-0.5">
                Inventory & expiry ({inventoryMetrics.products})
              </h2>
              <p className="page-subtitle">
                Every medicine with its stock on hand and nearest expiry. Open a product to see its
                batches, prices and generic equivalents.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                type="button"
                className="icon-button"
                aria-label="Refresh inventory"
                title="Refresh inventory"
                disabled={isLoading}
                onClick={() => void loadItems(true)}
              >
                <FiRefreshCw className={isLoading ? 'animate-spin' : ''} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setReport(!report)
                  void loadItems(true)
                }}
              >
                {report ? 'Hide report' : 'Inventory report'}
              </button>
              {account?.role === 'master' && (
                <button
                  type="button"
                  className="secondary-button"
                  disabled={exporting}
                  onClick={() => {
                    setExporting(true)
                    void exportInventory()
                      .then((saved) => setMessage(saved ? 'Inventory report exported.' : ''))
                      .catch((cause: unknown) =>
                        setMessage(
                          cause instanceof Error ? cause.message : 'Export failed.',
                          'error'
                        )
                      )
                      .finally(() => setExporting(false))
                  }}
                >
                  {exporting ? 'Exporting…' : 'Export CSV'}
                </button>
              )}
              {(account?.role === 'master' || account?.role === 'staff') && (
                <Link to="/items/$itemId" params={{ itemId: 'new' }} className="primary-button">
                  <FiPlus /> Add product
                </Link>
              )}
            </div>
          </div>
        </section>

        {message && (
          <p
            role={message.tone === 'error' ? 'alert' : 'status'}
            className={`status-message ${message.tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}
          >
            {message.text}
          </p>
        )}
        {report && !loadError && <InventoryReport items={items} />}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <section className="panel min-w-0 overflow-hidden">
            <header className="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <h3 className="font-semibold">List of medicines</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Search or filter, then open a product to see its batches and expiry dates.
                </p>
              </div>
              <span className="border-brand-100 bg-brand-50/80 text-brand-700 w-fit rounded-full border px-3 py-1 text-xs font-semibold">
                {filteredItems.length} shown
              </span>
            </header>

            {loadError && (
              <p
                role="alert"
                className="border-b border-rose-200/80 bg-rose-50/80 px-5 py-3 text-sm text-rose-700"
              >
                {loadError}
              </p>
            )}

            <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:px-6">
              <label className="relative block min-w-0 flex-1 sm:max-w-xl">
                <span className="sr-only">Search medicines</span>
                <FiSearch className="absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search generic name, brand, category, or formulation"
                  className="field mt-0 pl-10"
                />
              </label>
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value as StockFilter)}
                className="field mt-0 sm:w-56"
                aria-label="Filter by stock or expiry status"
              >
                {stockFilters.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="divide-y divide-slate-100">
              {filteredItems.map((item) => {
                const status = getStockStatus(item)
                const stock = getItemStock(item)
                const nextExpiry = item.batches
                  .filter((batch) => batch.stock > 0)
                  .map((batch) => batch.expiresAt.slice(0, 10))
                  .sort()[0]

                return (
                  <Link
                    key={item.id}
                    to="/items/$itemId"
                    params={{ itemId: String(item.id) }}
                    className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-slate-50 sm:px-6"
                  >
                    <div className="border-brand-100 bg-brand-50/80 text-brand-700 shadow-brand-100/60 grid size-11 shrink-0 place-items-center rounded-lg border shadow-sm">
                      <FiArchive />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold text-slate-900">{item.brandName}</h3>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${status === 'in-stock' ? 'border-emerald-100 bg-emerald-50/80 text-emerald-700' : status === 'low-stock' ? 'border-amber-100 bg-amber-50/80 text-amber-700' : 'border-rose-100 bg-rose-50/80 text-rose-700'}`}
                        >
                          {statusLabels[status]}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm text-slate-500">
                        {item.genericName} · {item.formulation}
                      </p>
                      {item.batches.some(
                        (batch) => batch.stock > 0 && getExpiryStatus(batch.expiresAt) === 'expired'
                      ) && (
                        <p className="mt-1 text-xs font-semibold text-rose-700">
                          Expired stock — excluded from sellable units
                        </p>
                      )}
                      {item.batches.some(
                        (batch) =>
                          batch.stock > 0 && getExpiryStatus(batch.expiresAt) === 'near-expiry'
                      ) && (
                        <p className="mt-1 text-xs font-semibold text-amber-700">
                          Stock nearing expiry
                        </p>
                      )}
                    </div>
                    <div className="hidden w-40 text-right md:block">
                      <p className="text-xs text-slate-500">Next expiry</p>
                      <p className="text-sm font-medium text-slate-800">
                        {nextExpiry ? expiryDate.format(new Date(nextExpiry)) : 'No stock on hand'}
                      </p>
                    </div>
                    <div className="hidden text-right sm:block">
                      <p className="font-semibold text-slate-900">{stock} on hand</p>
                      <p className="text-xs text-slate-500">{getSellableStock(item)} sellable</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.batches.length} recorded batch
                        {item.batches.length === 1 ? '' : 'es'}
                      </p>
                    </div>
                    <FiChevronRight className="group-hover:text-brand-700 shrink-0 text-slate-400 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Link>
                )
              })}
              {isLoading && (
                <p role="status" className="p-5 text-sm text-slate-500">
                  Loading current inventory…
                </p>
              )}
              {!isLoading && filteredItems.length === 0 && (
                <div className="px-5 py-14 text-center sm:px-6">
                  <div className="mx-auto grid size-12 place-items-center rounded-lg bg-slate-100/80 text-slate-400">
                    <FiArchive />
                  </div>
                  <p className="mt-4 font-medium text-slate-700">
                    {items.length === 0 ? 'No products yet.' : 'No medicines match this search.'}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {items.length === 0
                      ? 'Add a product to the catalog, then receive stock for it through a purchase order.'
                      : 'Try another name, or set the filter back to All products.'}
                  </p>
                </div>
              )}
            </div>
          </section>

          <aside className="grid gap-5 sm:grid-cols-3 xl:grid-cols-1">
            <InventoryMetric
              icon={<FiArchive />}
              label="Catalog products"
              value={String(inventoryMetrics.products)}
              description="Active medicine profiles"
            />
            <InventoryMetric
              icon={<FiLayers />}
              label="Units on hand"
              value={String(inventoryMetrics.availableUnits)}
              description="Includes expired stock awaiting removal"
            />
            <InventoryMetric
              icon={<FiAlertTriangle />}
              label="Needs attention"
              value={String(inventoryMetrics.lowStock + inventoryMetrics.outOfStock)}
              description={`${inventoryMetrics.lowStock} low stock · ${inventoryMetrics.outOfStock} out of stock`}
            />
          </aside>
        </div>
      </div>
    </DashboardShell>
  )
}

function InventoryMetric({
  icon,
  label,
  value,
  description
}: {
  icon: ReactElement
  label: string
  value: string
  description: string
}): ReactElement {
  return (
    <section className="panel p-5">
      <div className="relative">
        <div className="text-brand-700 grid size-10 place-items-center rounded-lg border border-slate-200 bg-white shadow-sm">
          {icon}
        </div>
        <p className="mt-5 text-sm text-slate-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
        <p className="mt-2 text-xs leading-5 text-slate-500">{description}</p>
      </div>
    </section>
  )
}
