import DashboardShell from '@renderer/components/dashboard/DashboardShell'
import { getItemStock, getStockStatus } from '@renderer/data/profiles'
import { useProfileStore } from '@renderer/stores/useProfileStore'
import { Link } from '@tanstack/react-router'
import { useMemo, useState, type ReactElement } from 'react'
import { FiArchive, FiChevronRight, FiSearch } from 'react-icons/fi'

const statusLabels = {
  'in-stock': 'In stock',
  'low-stock': 'Low stock',
  'out-of-stock': 'Out of stock'
}

export default function ItemDirectory(): ReactElement {
  const items = useProfileStore((state) => state.items)
  const [query, setQuery] = useState('')
  const filteredItems = useMemo(() => {
    const search = query.trim().toLowerCase()
    return items.filter(
      (item) =>
        !search ||
        `${item.genericName} ${item.brandName} ${item.formulation}`.toLowerCase().includes(search)
    )
  }, [items, query])

  return (
    <DashboardShell pageTitle="Inventory">
      <div className="space-y-6">
        <section>
          <p className="eyebrow">Item profiles</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
            Medicine catalog
          </h2>
          <p className="mt-2 text-sm text-neutral-500">
            Review product details, generic equivalents, stock batches, pricing, and expiry dates.
          </p>
        </section>
        <section className="panel overflow-hidden">
          <div className="border-b border-neutral-200 p-4">
            <label className="relative block max-w-xl">
              <span className="sr-only">Search medicines</span>
              <FiSearch className="absolute top-3 left-3.5 text-neutral-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search generic name, brand, or formulation"
                className="field mt-0 pl-10"
              />
            </label>
          </div>
          <div className="divide-y divide-neutral-100">
            {filteredItems.map((item) => {
              const status = getStockStatus(item)
              return (
                <Link
                  key={item.id}
                  to="/items/$itemId"
                  params={{ itemId: String(item.id) }}
                  className="flex items-center gap-4 p-5 transition hover:bg-neutral-50"
                >
                  <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-mauve-50 text-mauve-700">
                    <FiArchive />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{item.brandName}</h3>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${status === 'in-stock' ? 'bg-emerald-50 text-emerald-700' : status === 'low-stock' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}
                      >
                        {statusLabels[status]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-neutral-500">
                      {item.genericName} · {item.formulation}
                    </p>
                  </div>
                  <div className="hidden text-right sm:block">
                    <p className="font-semibold">{getItemStock(item)} units</p>
                    <p className="text-xs text-neutral-500">{item.batches.length} active batches</p>
                  </div>
                  <FiChevronRight className="shrink-0 text-neutral-400" />
                </Link>
              )
            })}
            {filteredItems.length === 0 && (
              <p className="p-10 text-center text-sm text-neutral-500">
                No medicines match your search.
              </p>
            )}
          </div>
        </section>
      </div>
    </DashboardShell>
  )
}
