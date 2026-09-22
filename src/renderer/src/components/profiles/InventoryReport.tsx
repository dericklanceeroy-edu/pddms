import { getItemStock, getSellableStock, type ItemProfile } from '@renderer/data/profiles'
import { expiryLabels, getExpiryStatus } from '@shared/inventory'
import type { ReactElement } from 'react'

export default function InventoryReport({ items }: { items: ItemProfile[] }): ReactElement {
  return (
    <section className="panel min-w-0 overflow-hidden">
      <h3 className="p-5 font-semibold">Current inventory report</h3>
      <div className="max-h-[65vh] overflow-auto" tabIndex={0} aria-label="Inventory report table">
        <table className="w-full min-w-[850px] text-left text-sm">
          <thead className="sticky top-0 bg-neutral-50">
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
          <tbody className="divide-y divide-neutral-100">
            {items.flatMap((item) =>
              (item.batches.length ? item.batches : [null]).map((batch) => (
                <tr key={`${item.id}-${batch?.id ?? 'empty'}`}>
                  <td className="max-w-60 px-4 py-3 break-words">
                    {item.brandName}
                    <p className="text-xs text-neutral-500">
                      {item.genericName} · {item.formulation}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {getItemStock(item)} / {getSellableStock(item)}
                  </td>
                  <td className="px-4 py-3">
                    {getSellableStock(item) === 0
                      ? 'Out of stock'
                      : getSellableStock(item) <= item.reorderLevel
                        ? 'Low stock'
                        : 'In stock'}
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
                          : 'text-neutral-500'
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
        {!items.length && <p className="p-5 text-sm text-neutral-500">No products recorded.</p>}
      </div>
    </section>
  )
}
