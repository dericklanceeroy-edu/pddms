import { getItemStock, getSellableStock, type ItemProfile } from '@renderer/data/profiles'
import { expiryLabels, getExpiryStatus } from '@shared/inventory'
import { useMemo, useState, type ReactElement } from 'react'
import { FiSearch } from 'react-icons/fi'
import {
  matchesFilter,
  matchesSearch,
  stockFilters,
  stockLabel,
  type StockFilter
} from './stockFilters'

export default function InventoryReport({ items: all }: { items: ItemProfile[] }): ReactElement {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<StockFilter>('all')
  const items = useMemo(
    () => all.filter((item) => matchesFilter(item, filter) && matchesSearch(item, query)),
    [all, filter, query]
  )
  return (
    <section className="panel min-w-0 overflow-hidden">
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="section-title">Current Inventory Report</h3>
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="relative block min-w-0 sm:w-80">
            <span className="sr-only">Search the inventory report</span>
            <FiSearch
              aria-hidden="true"
              className="absolute top-1/2 left-3.5 -translate-y-1/2 text-slate-400"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search brand, generic, category or formulation"
              className="field mt-0 pl-10"
            />
          </label>
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value as StockFilter)}
            className="field mt-0 sm:w-56"
            aria-label="Filter the report by stock or expiry status"
          >
            {stockFilters.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="max-h-[65vh] overflow-auto" tabIndex={0} aria-label="Inventory report table">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="sticky top-0 bg-slate-50">
            <tr>
              {[
                'Product',
                'On hand / sellable',
                'Stock status',
                'Batch / supplier',
                'Batch stock',
                'Expiry',
                'Received / PO'
              ].map((label) => (
                <th key={label} className="px-4 py-3">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.flatMap((item) =>
              (item.batches.length ? item.batches : [null]).map((batch) => (
                <tr key={`${item.id}-${batch?.id ?? 'empty'}`}>
                  <td className="max-w-60 px-4 py-3 break-words">
                    {item.brandName}
                    <p className="text-xs text-slate-500">
                      {item.genericName} · {item.formulation}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {getItemStock(item)} / {getSellableStock(item)}
                  </td>
                  <td className="px-4 py-3">
                    {stockLabel(item)}
                    <p className="text-xs">Threshold: {item.reorderLevel}</p>
                  </td>
                  <td className="max-w-60 px-4 py-3 break-words">
                    {batch?.batchNumber ?? 'No batches'}
                    <p className="text-xs">{batch?.supplier}</p>
                  </td>
                  <td className="px-4 py-3">{batch?.stock ?? 0}</td>
                  <td className="px-4 py-3">
                    {batch?.expiresAt}
                    <p
                      className={
                        batch && getExpiryStatus(batch.expiresAt) === 'expired'
                          ? 'text-rose-700'
                          : 'text-slate-500'
                      }
                    >
                      {batch ? expiryLabels[getExpiryStatus(batch.expiresAt)] : '—'}
                    </p>
                  </td>
                  <td className="max-w-64 px-4 py-3 break-words">
                    {batch?.receipts.map((receipt, index) => (
                      <p key={index}>
                        {receipt.deliveredAt} · {receipt.orderNumber} · {receipt.quantity} units
                      </p>
                    ))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {!items.length && (
          <p className="p-5 text-sm text-slate-600">
            {all.length ? 'No products match this search or filter.' : 'No products recorded.'}
          </p>
        )}
      </div>
    </section>
  )
}
