import DashboardShell from '@renderer/components/dashboard/DashboardShell'
import { getItemStock, getSellableStock, getStockStatus } from '@renderer/data/profiles'
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
  FiSearch
} from 'react-icons/fi'
import InventoryReport from './InventoryReport'

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
  const [message, setMessage] = useState('')
  const [exporting, setExporting] = useState(false)

  const [query, setQuery] = useState('')

  const filteredItems = useMemo(() => {
    const search = query.trim().toLowerCase()

    return items.filter(
      (item) =>
        !search ||
        `${item.genericName} ${item.brandName} ${item.category} ${item.formulation}`
          .toLowerCase()
          .includes(search)
    )
  }, [items, query])

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
        <section className="page-intro p-6 sm:p-7">
          <div className="mesh-glow -top-28 right-0 size-72 bg-indigo-300/30" />
          <div className="mesh-glow -bottom-36 left-1/4 size-72 bg-mauve-300/25" />
          <div className="page-intro-content flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div className="max-w-2xl">
              <p className="eyebrow">Item profiles</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                Medicine catalog
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-neutral-600 sm:text-base">
                Review product details, generic equivalents, active stock batches, pricing, and
                expiry information from one clear catalog.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="secondary-button"
                disabled={isLoading}
                onClick={() => void loadItems(true)}
              >
                {isLoading ? 'Loading…' : 'Refresh'}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setReport(!report)
                  void loadItems(true)
                }}
              >
                {report ? 'Hide report' : 'View inventory report'}
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
                        setMessage(cause instanceof Error ? cause.message : 'Export failed.')
                      )
                      .finally(() => setExporting(false))
                  }}
                >
                  {exporting ? 'Exporting…' : 'Export CSV'}
                </button>
              )}
              <div className="glass-surface rounded-2xl px-4 py-2.5">
                <p className="text-[0.68rem] font-semibold tracking-[0.14em] text-neutral-500 uppercase">
                  Products
                </p>
                <p className="mt-1 text-lg font-semibold text-neutral-900">
                  {inventoryMetrics.products}
                </p>
              </div>
              {(account?.role === 'master' || account?.role === 'staff') && (
                <Link to="/items/$itemId" params={{ itemId: 'new' }} className="primary-button">
                  <FiPlus /> Add product
                </Link>
              )}
            </div>
          </div>
        </section>

        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
        {report && !loadError && <InventoryReport items={items} />}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <section className="panel min-w-0 overflow-hidden">
            <header className="flex flex-col gap-4 border-b border-white/65 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <h3 className="font-semibold">Catalog directory</h3>
                <p className="mt-1 text-sm text-neutral-500">
                  Search a product, then open its complete inventory profile.
                </p>
              </div>
              <span className="w-fit rounded-full border border-mauve-100 bg-mauve-50/80 px-3 py-1 text-xs font-semibold text-mauve-700">
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

            <div className="border-b border-white/65 p-4 sm:px-6 sm:py-5">
              <label className="relative block max-w-xl">
                <span className="sr-only">Search medicines</span>
                <FiSearch className="absolute top-1/2 left-3.5 -translate-y-1/2 text-neutral-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search generic name, brand, category, or formulation"
                  className="field mt-0 pl-10"
                />
              </label>
            </div>

            <div className="divide-y divide-white/65">
              {filteredItems.map((item) => {
                const status = getStockStatus(item)
                const stock = getItemStock(item)

                return (
                  <Link
                    key={item.id}
                    to="/items/$itemId"
                    params={{ itemId: String(item.id) }}
                    className="group flex items-center gap-4 px-5 py-4 transition duration-200 hover:bg-white/45 sm:px-6 sm:py-5"
                  >
                    <div className="grid size-11 shrink-0 place-items-center rounded-2xl border border-mauve-100 bg-mauve-50/80 text-mauve-700 shadow-sm shadow-mauve-100/60">
                      <FiArchive />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate font-semibold text-neutral-900">
                          {item.brandName}
                        </h3>
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${status === 'in-stock' ? 'border-emerald-100 bg-emerald-50/80 text-emerald-700' : status === 'low-stock' ? 'border-amber-100 bg-amber-50/80 text-amber-700' : 'border-rose-100 bg-rose-50/80 text-rose-700'}`}
                        >
                          {statusLabels[status]}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm text-neutral-500">
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
                    <div className="hidden text-right sm:block">
                      <p className="font-semibold text-neutral-900">{stock} on hand</p>
                      <p className="text-xs text-neutral-500">{getSellableStock(item)} sellable</p>
                      <p className="mt-1 text-xs text-neutral-500">
                        {item.batches.length} recorded batches
                      </p>
                    </div>
                    <FiChevronRight className="shrink-0 text-neutral-400 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-mauve-700" />
                  </Link>
                )
              })}
              {isLoading && (
                <p role="status" className="p-5 text-sm text-neutral-500">
                  Loading current inventory…
                </p>
              )}
              {!isLoading && filteredItems.length === 0 && (
                <div className="px-5 py-14 text-center sm:px-6">
                  <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-neutral-100/80 text-neutral-400">
                    <FiArchive />
                  </div>
                  <p className="mt-4 font-medium text-neutral-700">
                    No medicines match this search.
                  </p>
                  <p className="mt-1 text-sm text-neutral-500">
                    Try another product name, category, or formulation.
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
    <section className="glass-surface relative overflow-hidden rounded-3xl p-5">
      <div className="absolute -top-8 -right-8 size-24 rounded-full bg-indigo-200/35 blur-2xl" />
      <div className="relative">
        <div className="grid size-10 place-items-center rounded-2xl border border-white/80 bg-white/65 text-mauve-700 shadow-sm">
          {icon}
        </div>
        <p className="mt-5 text-sm text-neutral-500">{label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-neutral-950">{value}</p>
        <p className="mt-2 text-xs leading-5 text-neutral-500">{description}</p>
      </div>
    </section>
  )
}
